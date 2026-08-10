// NOAA GFS-Wave GRIB2 anti-corruption adapter. It consumes the public
// grib_filter response as received and emits the post-ACL ForecastSource port
// language: UTC run/valid timestamps, metres, seconds, degrees, and a
// land-mask decision already made. The supported templates are intentionally
// narrow: this adapter proves the captured NOAA P2 shape, rather than
// pretending every GRIB2 product has the same packing.

import type { Clock, ForecastSource, MemberHour, MemberSeries, SourceResult, TideHour, WindHour } from '../ports';
import type { SpotCoordinate } from './spot-coordinates';

const GRIB_MAGIC = 'GRIB';
const GRIB_END = '7777';
const GRIB2_EDITION = 2;
const NOAA_GFSWAVE_MEMBER = 'ncep_gfswave016';
const NOAA_FILTER_ENDPOINT = 'https://nomads.ncep.noaa.gov/cgi-bin/filter_gfswave.pl';

type WaveField = 'height' | 'period' | 'direction';

type DecodedField = {
  readonly field: WaveField;
  readonly run_ts: string;
  readonly valid_ts: string;
  readonly value: number;
  readonly land_masked: boolean;
};

type GridPoint = { readonly lat: number; readonly lon: number };

type DecodedHour = {
  readonly run_ts: string;
  readonly hour: MemberHour;
};

type SectionIndex = ReadonlyMap<number, number>;
type IndexedMessage = { readonly bytes: Uint8Array; readonly sections: SectionIndex };

/**
 * NOAA's public GFS-Wave grib_filter adapter. It is a real ForecastSource,
 * not a parser reachable only from tests: fetchWaveMembers preserves the
 * binary response byte-for-byte for the raw archive, then crosses the port
 * with normalized member data. Wind and tide stay with their dedicated
 * providers in the composition root.
 */
export class NoaaGfswaveForecastSource implements ForecastSource {
  constructor(
    private readonly spotsById: ReadonlyMap<string, SpotCoordinate>,
    private readonly clock: Clock,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async fetchWaveMembers(spot_id: string): Promise<SourceResult<MemberSeries[]>> {
    const spot = this.requireSpot(spot_id);
    try {
      const response = await this.fetchImpl(noaaFilterUrl(spot, this.clock.now()));
      if (!response.ok) return { ok: false, reason: 'error' };
      const verbatim = new Uint8Array(await response.arrayBuffer());
      const data = parseGfswaveGrib2(verbatim, spot);
      return { ok: true, verbatim, data };
    } catch {
      return { ok: false, reason: 'error' };
    }
  }

  fetchWind(_spot_id: string): Promise<SourceResult<WindHour[]>> {
    return Promise.resolve({ ok: false, reason: 'dark' });
  }

  fetchTide(_spot_id: string): Promise<SourceResult<TideHour[]>> {
    return Promise.resolve({ ok: false, reason: 'dark' });
  }

  private requireSpot(spot_id: string): SpotCoordinate {
    const spot = this.spotsById.get(spot_id);
    if (spot === undefined) throw new Error(`NoaaGfswaveForecastSource: no coordinate registered for ${spot_id}`);
    return spot;
  }
}

function noaaFilterUrl(spot: SpotCoordinate, now: Date): string {
  const runDate = now.toISOString().slice(0, 10).replaceAll('-', '');
  const longitude = spot.lon < 0 ? spot.lon + 360 : spot.lon;
  const leftlon = coordinateText(longitude - 2);
  const rightlon = coordinateText(longitude + 2);
  const toplat = coordinateText(spot.lat + 2);
  const bottomlat = coordinateText(spot.lat - 2);
  const directory = `/gfs.${runDate}/00/wave/gridded`;
  return `${NOAA_FILTER_ENDPOINT}?file=gfswave.t00z.global.0p16.f000.grib2&all_lev=on&var_HTSGW=on&var_PERPW=on&var_DIRPW=on&subregion=&leftlon=${leftlon}&rightlon=${rightlon}&toplat=${toplat}&bottomlat=${bottomlat}&dir=${encodeURIComponent(directory)}`;
}

function coordinateText(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * Decodes the real NOAA gfswave grib_filter response used by the independent
 * source. One response carries HTSGW, PERPW and DIRPW as separate GRIB2
 * messages. A first unmasked value from each matching message becomes one
 * normalized wave hour; the source request already limits its bbox to the
 * supported coast.
 */
export function parseGfswaveGrib2(bytes: Uint8Array, target?: GridPoint): MemberSeries[] {
  const fields = readGribMessages(bytes)
    .map((message) => decodeWaveField(message, target))
    .flatMap((field) => field === null ? [] : [field]);
  const decodedHours = combineWaveFields(fields);
  return decodedHours.length === 0
    ? []
    : [{
      source: NOAA_GFSWAVE_MEMBER,
      run_ts: decodedHours[0]!.run_ts,
      hours: decodedHours.map(({ hour }) => hour),
    }];
}

function readGribMessages(bytes: Uint8Array): IndexedMessage[] {
  const messages: IndexedMessage[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    assertMagic(bytes, offset);
    assertEdition(bytes, offset);
    const messageLength = readLength(bytes, offset);
    const messageEnd = offset + messageLength;
    if (messageEnd > bytes.length || textAt(bytes, messageEnd - 4, 4) !== GRIB_END) {
      throw new Error('NOAA GRIB2 response has an invalid declared message length');
    }
    messages.push({ bytes, sections: indexSections(bytes, offset + 16, messageEnd - 4) });
    offset = messageEnd;
  }
  return messages;
}

function assertMagic(bytes: Uint8Array, offset: number): void {
  if (textAt(bytes, offset, 4) !== GRIB_MAGIC) throw new Error('NOAA response is not a GRIB2 message');
}

function assertEdition(bytes: Uint8Array, offset: number): void {
  if (bytes[offset + 7] !== GRIB2_EDITION) {
    throw new Error(`NOAA response has unsupported GRIB edition ${String(bytes[offset + 7])}`);
  }
}

function readLength(bytes: Uint8Array, offset: number): number {
  const length = Number(viewOf(bytes).getBigUint64(offset + 8));
  if (!Number.isSafeInteger(length) || length < 20) throw new Error('NOAA GRIB2 response has an invalid message length');
  return length;
}

function indexSections(bytes: Uint8Array, start: number, end: number): SectionIndex {
  const view = viewOf(bytes);
  const sections = new Map<number, number>();
  let offset = start;
  while (offset < end) {
    const length = view.getUint32(offset);
    if (length < 5 || offset + length > end) throw new Error('NOAA GRIB2 response has an invalid section length');
    sections.set(bytes[offset + 4]!, offset);
    offset += length;
  }
  for (const required of [1, 4, 5, 6, 7]) {
    if (!sections.has(required)) throw new Error(`NOAA GRIB2 response is missing section ${required}`);
  }
  return sections;
}

function decodeWaveField(message: IndexedMessage, target?: GridPoint): DecodedField | null {
  const { bytes, sections } = message;
  const section4 = requiredSection(sections, 4);
  const field = waveFieldAt(bytes, section4);
  if (field === null) return null;
  const run_ts = runTimestamp(bytes, requiredSection(sections, 1));
  const valid_ts = validTimestamp(bytes, run_ts, section4);
  const decoded = packedValueAt(bytes, requiredSection(sections, 3), requiredSection(sections, 5), requiredSection(sections, 6), requiredSection(sections, 7), target);
  return { field, run_ts, valid_ts, ...decoded };
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

function requiredSection(sections: SectionIndex, number: number): number {
  const section = sections.get(number);
  if (section === undefined) throw new Error(`NOAA GRIB2 response is missing section ${number}`);
  return section;
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
  throw new Error(`NOAA GRIB2 response uses unsupported forecast-time unit ${unit}`);
}

function packedValueAt(bytes: Uint8Array, section3: number, section5: number, section6: number, section7: number, target?: GridPoint): Pick<DecodedField, 'value' | 'land_masked'> {
  const view = viewOf(bytes);
  if (view.getUint16(section5 + 9) !== 0) throw new Error('NOAA GRIB2 response uses unsupported data representation');
  const bitmapIndicator = bytes[section6 + 5]!;
  if (bitmapIndicator !== 0 && bitmapIndicator !== 255) throw new Error('NOAA GRIB2 response uses unsupported bitmap');
  const point = target === undefined ? 0 : requestedGridIndex(bytes, section3, target);
  const packedIndex = bitmapIndicator === 0 ? packedIndexForGridPoint(bytes, section6, point) : point;
  if (packedIndex === null) return { value: 0, land_masked: true };
  const reference = view.getFloat32(section5 + 11);
  const binaryScale = signed16(view.getUint16(section5 + 15));
  const decimalScale = signed16(view.getUint16(section5 + 17));
  const bitsPerValue = bytes[section5 + 19]!;
  const packed = readBits(bytes, section7 + 5, bitsPerValue, packedIndex);
  return { value: (reference + packed * 2 ** binaryScale) / 10 ** decimalScale, land_masked: false };
}

function requestedGridIndex(bytes: Uint8Array, section3: number, target: GridPoint): number {
  const view = viewOf(bytes);
  if (view.getUint16(section3 + 12) !== 0 || bytes[section3 + 71] !== 64) {
    throw new Error('NOAA GRIB2 response uses an unsupported grid geometry or scan order');
  }
  const ni = view.getUint32(section3 + 30);
  const nj = view.getUint32(section3 + 34);
  const lat1 = signedMagnitude(view.getUint32(section3 + 46)) / 1_000_000;
  const lon1 = signedMagnitude(view.getUint32(section3 + 50)) / 1_000_000;
  const di = view.getUint32(section3 + 63) / 1_000_000;
  const dj = view.getUint32(section3 + 67) / 1_000_000;
  const lon = target.lon < 0 ? target.lon + 360 : target.lon;
  const i = Math.round((lon - lon1) / di);
  const j = Math.round((target.lat - lat1) / dj);
  if (i < 0 || i >= ni || j < 0 || j >= nj) throw new Error('NOAA GRIB2 response does not cover the requested spot');
  return j * ni + i;
}

function packedIndexForGridPoint(bytes: Uint8Array, section6: number, point: number): number | null {
  let packed = 0;
  for (let index = 0; index <= point; index += 1) {
    const present = (bytes[section6 + 6 + Math.floor(index / 8)]! & (1 << (7 - (index % 8)))) !== 0;
    if (!present && index === point) return null;
    if (present && index === point) return packed;
    if (present) packed += 1;
  }
  throw new Error('NOAA GRIB2 response bitmap does not cover the requested spot');
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

function combineWaveFields(fields: readonly DecodedField[]): DecodedHour[] {
  const grouped = new Map<string, Partial<Record<WaveField, DecodedField>>>();
  for (const field of fields) {
    const key = `${field.run_ts}|${field.valid_ts}`;
    grouped.set(key, { ...grouped.get(key), [field.field]: field });
  }
  return [...grouped.values()]
    .flatMap((entry) => entry.height !== undefined && entry.period !== undefined && entry.direction !== undefined
      ? [{
        run_ts: entry.height.run_ts,
        hour: {
          valid_ts: entry.height.valid_ts,
          swell: { h_m: entry.height.value, t_s: entry.period.value, dir_deg: entry.direction.value },
          swell2: null,
          land_masked: entry.height.land_masked || entry.period.land_masked || entry.direction.land_masked,
        },
      }]
      : [])
    .sort((left, right) => left.hour.valid_ts.localeCompare(right.hour.valid_ts));
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
