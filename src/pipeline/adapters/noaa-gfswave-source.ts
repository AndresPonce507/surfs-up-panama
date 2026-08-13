// NOAA gfswave GRIB2 anti-corruption adapter: the second, independent wave
// vendor the confidence story needs (adr-openmeteo-vs-raw-grib2.md decision 3,
// "a registry change plus one adapter"). The public grib_filter service
// (US public domain) answers with raw GRIB2 bytes on a fixed 0.16-degree
// grid, one message per requested variable per forecast hour. This adapter
// crosses that wire format into the same post-ACL ForecastSource language
// Open-Meteo already speaks: normalized units, minute-precision UTC
// timestamps, a land-mask decision already made.
//
// Four normalizations this re-fit owes over the prior art on build/f2-trust
// (mined for its GRIB2 section decoding, not imported wholesale, per the W4
// scope amendment):
//
//   1. Binary GRIB2 cannot ride the port's `verbatim: string` honestly, and
//      the raw forensic archive stores exactly what this adapter returns. So
//      fetchWavePayload requests all 17 three-hourly subsets (f000..f048)
//      for the spot's own +/-2 degree window and wraps every sub-response in
//      a JSON capture envelope carrying each part's URL, base64 body and
//      sha256, self-identifying as `capture: 'noaa-gfswave-grib2/v1'` so
//      parseWaveMembers can refuse anything that is not its own bytes. Any
//      sub-request failing reports the whole payload dark (`ok: false,
//      reason: 'error'`): a partially sighted member must never masquerade
//      as the full opinion.
//   2. parseWaveMembers verifies every part's sha256 before decoding a single
//      GRIB2 byte, and normalizes run_ts/valid_ts to the house minute
//      precision (`2026-08-13T00:00Z`) the ranking filter's
//      `endsWith('T18:00Z')` and Open-Meteo's own attribution already use.
//      Full-second timestamps would silently never match either.
//   3. The source id stays `ncep_gfswave016`: the same physical model is the
//      same series to every consumer regardless of which vendor served the
//      bytes (adr-openmeteo-vs-raw-grib2.md, consequences).
//   4. The spot's exact grid cell is preferred; the real committed capture
//      (tests/acceptance/f-know-how-much-to-trust-it/fixtures/
//      noaa-gfswave-20260813/capture-receipt.json) proves Playa Venao's exact
//      cell is land-masked. When that happens this adapter reads the nearest
//      OCEAN cell by real distance in metres (equirectangular, cos(lat)
//      scaled) among the cells within a two-cell radius of the SPOT'S OWN
//      cell, not of the spot's raw coordinate: once a spot is already
//      committed to one grid cell, "nearest" means nearest to that cell, and
//      at this grid's resolution the cos(lat) term makes an east/west step
//      fractionally shorter than a north/south one, which is why the real
//      answer for Venao is the cell one step east (0.76 m / 14.43 s /
//      194.65 deg at f018) and not the geometrically closer-looking
//      south neighbour measured from the raw coordinate. With no ocean cell
//      in that radius, the hour stays land_masked: true, a stated absence,
//      never the most favourable reading (CLAUDE.md, "the one rule the whole
//      product rests on").
//
// Wind and tide stay with their own providers (fetchWindPayload,
// fetchTidePayload, parseWind, parseTide all report 'dark').

import { createHash } from 'node:crypto';

import type { Clock, ForecastSource, MemberHour, MemberSeries, ReceivedSourcePayload, SourceResult, TideHour, WindHour } from '../ports';
import type { SpotCoordinate } from './spot-coordinates';

const NOAA_GFSWAVE_MEMBER = 'ncep_gfswave016';
const NOAA_FILTER_ENDPOINT = 'https://nomads.ncep.noaa.gov/cgi-bin/filter_gfswave.pl';
const CAPTURE_KIND = 'noaa-gfswave-grib2/v1';
const PROVIDER_NAME = 'noaa-gfswave';

/** gfswave publishes four cycles a day; the same conservative latency
 * Open-Meteo's CYCLE_REGISTRY already carries for this model
 * (open-meteo-source.ts), because both vendors answer for the same run. */
const CYCLE_HOURS_UTC = [0, 6, 12, 18] as const;
const CYCLE_LATENCY_HOURS = 5;

/** f000..f048 every three hours: 17 subsets, one grib_filter request each. */
const FORECAST_HOURS: readonly number[] = Array.from({ length: 17 }, (_, index) => index * 3);

/** "Nearest ocean cell... within a radius of two cells" (roadmap 04-02):
 * a Euclidean radius in grid-cell units, not a five-by-five square, so a
 * corner cell 2 rows AND 2 columns away never outranks a true 2-cell step. */
const LAND_MASK_SEARCH_RADIUS_CELLS = 2;

const GRIB_MAGIC = 'GRIB';
const GRIB_END = '7777';
const GRIB2_EDITION = 2;

type WaveField = 'height' | 'period' | 'direction';

type CapturedPart = {
  readonly url: string;
  readonly body_b64: string;
  readonly sha256: string;
};

type CaptureEnvelope = {
  readonly capture: string;
  readonly provider: string;
  readonly requests: readonly CapturedPart[];
};

type SelectedCycle = { readonly runDateUtc: string; readonly cycleHour: string };

type GridInfo = {
  readonly ni: number;
  readonly nj: number;
  readonly lat1: number;
  readonly lon1: number;
  readonly di: number;
  readonly dj: number;
};

type GridPoint = { readonly i: number; readonly j: number };
type LatLon = { readonly lat: number; readonly lon: number };

type FieldSections = {
  readonly section1: number;
  readonly section3: number;
  readonly section4: number;
  readonly section5: number;
  readonly section6: number;
  readonly section7: number;
};

type FieldSectionsByType = Readonly<Record<WaveField, FieldSections>>;

type IndexedMessage = { readonly sections: ReadonlyMap<number, number> };

type DecodedHour = { readonly run_ts: string; readonly hour: MemberHour };

/**
 * NOAA's public gfswave grib_filter adapter. A real ForecastSource, not a
 * parser reachable only from tests: fetchWavePayload preserves every
 * sub-response byte-for-byte (base64'd, sha256'd) for the raw archive before
 * parseWaveMembers ever gets a chance to reject malformed input.
 */
export class NoaaGfswaveForecastSource implements ForecastSource {
  private lastRequestedSpot: SpotCoordinate | null = null;

  constructor(
    private readonly spotsById: ReadonlyMap<string, SpotCoordinate>,
    private readonly clock: Clock,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async fetchWavePayload(spot_id: string): Promise<ReceivedSourcePayload> {
    const spot = this.requireSpot(spot_id);
    this.lastRequestedSpot = spot;
    const cycle = selectCycle(this.clock.now());
    const requests: CapturedPart[] = [];
    for (const forecastHour of FORECAST_HOURS) {
      const url = requestUrl(spot, cycle, forecastHour);
      let response: Response;
      try {
        response = await this.fetchImpl(url);
      } catch {
        return { ok: false, reason: 'error' };
      }
      if (!response.ok) return { ok: false, reason: 'error' };
      const bytes = new Uint8Array(await response.arrayBuffer());
      requests.push({
        url,
        body_b64: Buffer.from(bytes).toString('base64'),
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
    }
    const envelope: CaptureEnvelope = { capture: CAPTURE_KIND, provider: PROVIDER_NAME, requests };
    return { ok: true, verbatim: JSON.stringify(envelope), provider: PROVIDER_NAME };
  }

  parseWaveMembers(verbatim: string): SourceResult<MemberSeries[]> {
    try {
      const envelope = requireEnvelope(JSON.parse(verbatim) as unknown);
      const spot = this.requireLastRequestedSpot();
      const decodedHours = envelope.requests
        .map((part) => decodePartHour(part, spot))
        .sort((left, right) => left.hour.valid_ts.localeCompare(right.hour.valid_ts));
      const firstHour = decodedHours[0];
      if (firstHour === undefined) return { ok: false, reason: 'malformed' };
      return {
        ok: true,
        data: [{ source: NOAA_GFSWAVE_MEMBER, run_ts: firstHour.run_ts, hours: decodedHours.map((decoded) => decoded.hour) }],
      };
    } catch {
      return { ok: false, reason: 'malformed' };
    }
  }

  fetchWindPayload(_spot_id: string): Promise<ReceivedSourcePayload> {
    return Promise.resolve({ ok: false, reason: 'dark' });
  }

  parseWind(_verbatim: string): SourceResult<WindHour[]> {
    return { ok: false, reason: 'dark' };
  }

  fetchTidePayload(_spot_id: string): Promise<ReceivedSourcePayload> {
    return Promise.resolve({ ok: false, reason: 'dark' });
  }

  parseTide(_verbatim: string): SourceResult<TideHour[]> {
    return { ok: false, reason: 'dark' };
  }

  private requireSpot(spot_id: string): SpotCoordinate {
    const spot = this.spotsById.get(spot_id);
    if (spot === undefined) throw new Error(`NoaaGfswaveForecastSource: no coordinate registered for ${spot_id}`);
    return spot;
  }

  private requireLastRequestedSpot(): SpotCoordinate {
    if (this.lastRequestedSpot === null) {
      throw new Error('NoaaGfswaveForecastSource: parseWaveMembers called before a successful fetchWavePayload');
    }
    return this.lastRequestedSpot;
  }
}

// --------------------------- cycle and URL shape ---------------------------

/** 04-ingest-pipeline.md section 5 step 1-2, mirrored from open-meteo-source
 * candidateCycleIso: newest cycle where now >= cycle + latency. */
function selectCycle(now: Date): SelectedCycle {
  let best: number | null = null;
  for (let daysAgo = 0; daysAgo <= 3; daysAgo += 1) {
    for (const hour of CYCLE_HOURS_UTC) {
      const candidate = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo, hour, 0, 0);
      if (now.getTime() >= candidate + CYCLE_LATENCY_HOURS * 3_600_000 && (best === null || candidate > best)) {
        best = candidate;
      }
    }
  }
  if (best === null) throw new Error('no eligible gfswave cycle found within the 3-day lookback window');
  const cycleDate = new Date(best);
  return {
    runDateUtc: cycleDate.toISOString().slice(0, 10).replaceAll('-', ''),
    cycleHour: String(cycleDate.getUTCHours()).padStart(2, '0'),
  };
}

function requestUrl(spot: SpotCoordinate, cycle: SelectedCycle, forecastHour: number): string {
  const longitude = spot.lon < 0 ? spot.lon + 360 : spot.lon;
  const params = {
    file: `gfswave.t${cycle.cycleHour}z.global.0p16.f${String(forecastHour).padStart(3, '0')}.grib2`,
    all_lev: 'on',
    var_HTSGW: 'on',
    var_PERPW: 'on',
    var_DIRPW: 'on',
    subregion: '',
    leftlon: (longitude - 2).toFixed(1),
    rightlon: (longitude + 2).toFixed(1),
    toplat: (spot.lat + 2).toFixed(1),
    bottomlat: (spot.lat - 2).toFixed(1),
    dir: `/gfs.${cycle.runDateUtc}/${cycle.cycleHour}/wave/gridded`,
  };
  return `${NOAA_FILTER_ENDPOINT}?${new URLSearchParams(params).toString()}`;
}

// ------------------------------ envelope shape ------------------------------

function requireEnvelope(parsed: unknown): CaptureEnvelope {
  if (typeof parsed !== 'object' || parsed === null) throw new Error('noaa-gfswave response is not a JSON object');
  const candidate = parsed as Record<string, unknown>;
  if (candidate.capture !== CAPTURE_KIND || candidate.provider !== PROVIDER_NAME) {
    throw new Error('response is not a noaa-gfswave-grib2 capture envelope');
  }
  if (!Array.isArray(candidate.requests) || candidate.requests.length === 0) {
    throw new Error('noaa-gfswave envelope carries no captured parts');
  }
  return { capture: CAPTURE_KIND, provider: PROVIDER_NAME, requests: candidate.requests.map(requireCapturedPart) };
}

function requireCapturedPart(item: unknown): CapturedPart {
  if (typeof item !== 'object' || item === null) throw new Error('noaa-gfswave envelope has a malformed captured part');
  const part = item as Record<string, unknown>;
  if (typeof part.url !== 'string' || typeof part.body_b64 !== 'string' || typeof part.sha256 !== 'string') {
    throw new Error('noaa-gfswave captured part is missing url, body_b64 or sha256');
  }
  return { url: part.url, body_b64: part.body_b64, sha256: part.sha256 };
}

function decodeAndVerifyPart(part: CapturedPart): Uint8Array {
  const bytes = Buffer.from(part.body_b64, 'base64');
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== part.sha256) throw new Error(`noaa-gfswave part failed its sha256 integrity check: ${part.url}`);
  return new Uint8Array(bytes);
}

// ------------------------------ one hour, decoded ------------------------------

function decodePartHour(part: CapturedPart, spot: SpotCoordinate): DecodedHour {
  const bytes = decodeAndVerifyPart(part);
  const sections = fieldSectionsByType(bytes, readGribMessages(bytes));
  const grid = readGridInfo(bytes, sections.height.section3);
  const runTs = runTimestamp(bytes, sections.height.section1);
  const validTs = validTimestamp(bytes, runTs, sections.height.section4);
  const target = targetGridIndex(grid, spot.lat, spot.lon);
  const cell = selectCell(bytes, sections, grid, target);
  const swell = cell === null
    ? { h_m: 0, t_s: 0, dir_deg: 0 }
    : {
      h_m: requireValue(decodeValueAt(bytes, sections.height, grid, cell.i, cell.j)),
      t_s: requireValue(decodeValueAt(bytes, sections.period, grid, cell.i, cell.j)),
      dir_deg: requireValue(decodeValueAt(bytes, sections.direction, grid, cell.i, cell.j)),
    };
  return {
    run_ts: normalizeTimestamp(runTs),
    hour: { valid_ts: normalizeTimestamp(validTs), swell, swell2: null, land_masked: cell === null },
  };
}

function normalizeTimestamp(fullPrecisionIso: string): string {
  return `${fullPrecisionIso.slice(0, 16)}Z`;
}

function requireValue(value: number | null): number {
  if (value === null) throw new Error('noaa-gfswave selected an ocean cell that decoded to a masked value');
  return value;
}

// ------------------------------ cell selection ------------------------------

function targetGridIndex(grid: GridInfo, lat: number, lon: number): GridPoint {
  const longitude = lon < 0 ? lon + 360 : lon;
  return { i: Math.round((longitude - grid.lon1) / grid.di), j: Math.round((lat - grid.lat1) / grid.dj) };
}

function cellLatLon(grid: GridInfo, point: GridPoint): LatLon {
  return { lat: grid.lat1 + point.j * grid.dj, lon: grid.lon1 + point.i * grid.di };
}

const METRES_PER_DEGREE_LAT = 110_574;
const METRES_PER_DEGREE_LON_AT_EQUATOR = 111_320;

/** Real distance in metres. Equirectangular with cos(lat) scaling: accurate
 * enough at the few-kilometre, few-degrees-of-latitude scale a two-cell
 * search covers, and cheap. The cos(lat) term is what makes an east/west
 * grid step fractionally shorter than a north/south one away from the
 * equator, which is why the real nearest cell is not always the visually
 * "obvious" neighbour. */
function equirectangularMetres(origin: LatLon, point: LatLon): number {
  const metresPerDegreeLon = METRES_PER_DEGREE_LON_AT_EQUATOR * Math.cos((origin.lat * Math.PI) / 180);
  const deltaLat = (point.lat - origin.lat) * METRES_PER_DEGREE_LAT;
  const deltaLon = (point.lon - origin.lon) * metresPerDegreeLon;
  return Math.sqrt(deltaLat * deltaLat + deltaLon * deltaLon);
}

function isOceanAt(bytes: Uint8Array, sections: FieldSectionsByType, grid: GridInfo, point: GridPoint): boolean {
  return decodeValueAt(bytes, sections.height, grid, point.i, point.j) !== null
    && decodeValueAt(bytes, sections.period, grid, point.i, point.j) !== null
    && decodeValueAt(bytes, sections.direction, grid, point.i, point.j) !== null;
}

/**
 * The spot's exact cell if it is ocean. Otherwise the nearest ocean cell to
 * THAT CELL (not to the spot's raw coordinate) within a two-cell Euclidean
 * radius, real distance in metres, first-minimum-wins for determinism. `null`
 * means every cell in the radius is land: the hour stays land_masked, never
 * the most favourable reading.
 */
function selectCell(bytes: Uint8Array, sections: FieldSectionsByType, grid: GridInfo, target: GridPoint): GridPoint | null {
  if (isOceanAt(bytes, sections, grid, target)) return target;
  const origin = cellLatLon(grid, target);
  let best: (GridPoint & { readonly distanceM: number }) | null = null;
  for (let rowOffset = -LAND_MASK_SEARCH_RADIUS_CELLS; rowOffset <= LAND_MASK_SEARCH_RADIUS_CELLS; rowOffset += 1) {
    for (let colOffset = -LAND_MASK_SEARCH_RADIUS_CELLS; colOffset <= LAND_MASK_SEARCH_RADIUS_CELLS; colOffset += 1) {
      if (rowOffset === 0 && colOffset === 0) continue;
      if (colOffset * colOffset + rowOffset * rowOffset > LAND_MASK_SEARCH_RADIUS_CELLS ** 2) continue;
      const candidate: GridPoint = { i: target.i + colOffset, j: target.j + rowOffset };
      if (!isOceanAt(bytes, sections, grid, candidate)) continue;
      const distanceM = equirectangularMetres(origin, cellLatLon(grid, candidate));
      if (best === null || distanceM < best.distanceM) best = { ...candidate, distanceM };
    }
  }
  return best === null ? null : { i: best.i, j: best.j };
}

// ------------------------------ GRIB2 section decoding ------------------------------
// Mined from the prior art (build/f2-trust, noaa-gfswave-grib2.ts): the
// section-3 (grid definition), section-5 (data representation) and
// section-7 (simple-packed data) offsets, and the bitmap-driven land mask.
// The re-fit is decoding N grid points per message instead of one, and
// keeping section offsets around per field so a masked exact cell can look
// its neighbours up without re-parsing the message.

function readGribMessages(bytes: Uint8Array): readonly IndexedMessage[] {
  const messages: IndexedMessage[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    if (textAt(bytes, offset, 4) !== GRIB_MAGIC) throw new Error('noaa-gfswave part is not a GRIB2 message');
    if (bytes[offset + 7] !== GRIB2_EDITION) throw new Error(`noaa-gfswave part has unsupported GRIB edition ${String(bytes[offset + 7])}`);
    const messageLength = Number(viewOf(bytes).getBigUint64(offset + 8));
    if (!Number.isSafeInteger(messageLength) || messageLength < 20) throw new Error('noaa-gfswave part has an invalid GRIB2 message length');
    const messageEnd = offset + messageLength;
    if (messageEnd > bytes.length || textAt(bytes, messageEnd - 4, 4) !== GRIB_END) {
      throw new Error('noaa-gfswave part has an invalid declared GRIB2 message length');
    }
    messages.push({ sections: indexSections(bytes, offset + 16, messageEnd - 4) });
    offset = messageEnd;
  }
  return messages;
}

function indexSections(bytes: Uint8Array, start: number, end: number): ReadonlyMap<number, number> {
  const view = viewOf(bytes);
  const sections = new Map<number, number>();
  let offset = start;
  while (offset < end) {
    const length = view.getUint32(offset);
    if (length < 5 || offset + length > end) throw new Error('noaa-gfswave part has an invalid GRIB2 section length');
    sections.set(bytes[offset + 4]!, offset);
    offset += length;
  }
  return sections;
}

function requiredSection(sections: ReadonlyMap<number, number>, sectionNumber: number): number {
  const section = sections.get(sectionNumber);
  if (section === undefined) throw new Error(`noaa-gfswave part is missing GRIB2 section ${sectionNumber}`);
  return section;
}

function fieldSectionsByType(bytes: Uint8Array, messages: readonly IndexedMessage[]): FieldSectionsByType {
  const byType: Partial<Record<WaveField, FieldSections>> = {};
  for (const message of messages) {
    const section4 = requiredSection(message.sections, 4);
    const field = waveFieldAt(bytes, section4);
    if (field === null) continue;
    byType[field] = {
      section1: requiredSection(message.sections, 1),
      section3: requiredSection(message.sections, 3),
      section4,
      section5: requiredSection(message.sections, 5),
      section6: requiredSection(message.sections, 6),
      section7: requiredSection(message.sections, 7),
    };
  }
  if (byType.height === undefined || byType.period === undefined || byType.direction === undefined) {
    throw new Error('noaa-gfswave part is missing HTSGW, PERPW or DIRPW');
  }
  return byType as FieldSectionsByType;
}

function waveFieldAt(bytes: Uint8Array, section4: number): WaveField | null {
  const category = bytes[section4 + 9];
  const parameter = bytes[section4 + 10];
  if (category !== 0) return null;
  if (parameter === 3) return 'height';
  if (parameter === 11) return 'period';
  if (parameter === 10) return 'direction';
  return null;
}

function readGridInfo(bytes: Uint8Array, section3: number): GridInfo {
  const view = viewOf(bytes);
  if (view.getUint16(section3 + 12) !== 0 || bytes[section3 + 71] !== 64) {
    throw new Error('noaa-gfswave part uses an unsupported grid geometry or scan order');
  }
  return {
    ni: view.getUint32(section3 + 30),
    nj: view.getUint32(section3 + 34),
    lat1: signedMagnitude(view.getUint32(section3 + 46)) / 1_000_000,
    lon1: signedMagnitude(view.getUint32(section3 + 50)) / 1_000_000,
    di: view.getUint32(section3 + 63) / 1_000_000,
    dj: view.getUint32(section3 + 67) / 1_000_000,
  };
}

function runTimestamp(bytes: Uint8Array, section1: number): string {
  const view = viewOf(bytes);
  const year = view.getUint16(section1 + 12);
  const month = bytes[section1 + 14]! - 1;
  const day = bytes[section1 + 15]!;
  const hour = bytes[section1 + 16]!;
  const minute = bytes[section1 + 17]!;
  const second = bytes[section1 + 18]!;
  return new Date(Date.UTC(year, month, day, hour, minute, second)).toISOString();
}

function validTimestamp(bytes: Uint8Array, run_ts: string, section4: number): string {
  const unit = bytes[section4 + 17]!;
  const amount = viewOf(bytes).getUint32(section4 + 18);
  return new Date(Date.parse(run_ts) + amount * forecastUnitMilliseconds(unit)).toISOString();
}

function forecastUnitMilliseconds(unit: number): number {
  if (unit === 0) return 60_000;
  if (unit === 1) return 3_600_000;
  if (unit === 2) return 86_400_000;
  throw new Error(`noaa-gfswave part uses unsupported forecast-time unit ${unit}`);
}

/** One grid point's decoded value, or null when the bitmap marks it land.
 * Point indices outside the grid are treated the same as land: absent. */
function decodeValueAt(bytes: Uint8Array, fieldSections: FieldSections, grid: GridInfo, i: number, j: number): number | null {
  if (i < 0 || i >= grid.ni || j < 0 || j >= grid.nj) return null;
  const point = j * grid.ni + i;
  const view = viewOf(bytes);
  if (view.getUint16(fieldSections.section5 + 9) !== 0) throw new Error('noaa-gfswave part uses unsupported data representation');
  const bitmapIndicator = bytes[fieldSections.section6 + 5]!;
  if (bitmapIndicator !== 0 && bitmapIndicator !== 255) throw new Error('noaa-gfswave part uses unsupported bitmap');
  const packedIndex = bitmapIndicator === 0 ? packedIndexForGridPoint(bytes, fieldSections.section6, point) : point;
  if (packedIndex === null) return null;
  const reference = view.getFloat32(fieldSections.section5 + 11);
  const binaryScale = signed16(view.getUint16(fieldSections.section5 + 15));
  const decimalScale = signed16(view.getUint16(fieldSections.section5 + 17));
  const bitsPerValue = bytes[fieldSections.section5 + 19]!;
  const packed = readBits(bytes, fieldSections.section7 + 5, bitsPerValue, packedIndex);
  return (reference + packed * 2 ** binaryScale) / 10 ** decimalScale;
}

function packedIndexForGridPoint(bytes: Uint8Array, section6: number, point: number): number | null {
  let packed = 0;
  for (let index = 0; index <= point; index += 1) {
    const present = (bytes[section6 + 6 + Math.floor(index / 8)]! & (1 << (7 - (index % 8)))) !== 0;
    if (!present && index === point) return null;
    if (present && index === point) return packed;
    if (present) packed += 1;
  }
  throw new Error('noaa-gfswave part bitmap does not cover the requested grid point');
}

function readBits(bytes: Uint8Array, start: number, width: number, valueIndex = 0): number {
  let value = 0;
  for (let bit = 0; bit < width; bit += 1) {
    const bitOffset = start * 8 + valueIndex * width + bit;
    const byte = bytes[Math.floor(bitOffset / 8)]!;
    value = value * 2 + ((byte >> (7 - (bitOffset % 8))) & 1);
  }
  return value;
}

function signed16(value: number): number {
  return value & 0x8000 ? value - 0x1_0000 : value;
}

function signedMagnitude(value: number): number {
  return value & 0x8000_0000 ? -(value & 0x7fff_ffff) : value;
}

function textAt(bytes: Uint8Array, offset: number, length: number): string {
  return new TextDecoder().decode(bytes.slice(offset, offset + length));
}

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}
