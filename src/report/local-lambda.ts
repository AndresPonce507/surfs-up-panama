// Local Lambda composition for the real report write and mint contracts.
// Production infrastructure can bind this driving port to Function URLs; the
// core itself has no AWS dependency and is exercised against durable files.

import { createHmac, timingSafeEqual } from 'node:crypto';

import { QUALITY_TOKENS, WIND_STATE_TOKENS, type QualityToken, type WindStateToken } from '../data/report-vocab';
import { sizeBands, type SizeBandToken } from '../data/size-bands';
import { SIZE_BAND_SCHEMA, type ReportRecord, type ReportTrigger } from './report-record';
import { LocalWriteStore, type Receipt } from './local-write-store';

const DEVICE_PATTERN = /^d_[0-9a-f]{32}$/;
const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const ISO_UTC_SECOND_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const MAX_REPORT_BYTES = 4 * 1024;
const MAX_MINT_BYTES = 1024;
const DAILY_REPORT_LIMIT = 20;
const MAX_BACKDATE_MILLISECONDS = (12 * 60 + 15) * 60 * 1000;
const MAX_FUTURE_SKEW_MILLISECONDS = 15 * 60 * 1000;
const sizeBandTokens = new Set<string>(sizeBands.map(({ value }) => value));
const windTokens = new Set<string>(WIND_STATE_TOKENS);
const qualityTokens = new Set<string>(QUALITY_TOKENS);
const reportFields = new Set([
  'report_id', 'spot_id', 'observed_at', 'submitted_at', 'size_band', 'size_band_schema',
  'wind', 'quality', 'trigger', 'photo_ids', 'queued_offline', 'lang',
]);

export interface LocalWriteRequest {
  readonly path: '/api/mint' | '/api/report';
  readonly method: string;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body: string;
  readonly sourceIp: string;
}

export interface LocalWriteResponse {
  readonly statusCode: number;
  readonly body: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface LocalWriteLambda {
  handle(request: LocalWriteRequest): Promise<LocalWriteResponse>;
}

export interface LocalWriteLambdaDependencies {
  readonly storeRoot: string;
  readonly credentialSecret: string;
  readonly knownSpotIds: readonly string[];
  readonly clock: () => Date;
}

/** Composes the two write-path operations with a real local durable store. */
export function createLocalWriteLambda(dependencies: LocalWriteLambdaDependencies): LocalWriteLambda {
  if (Buffer.byteLength(dependencies.credentialSecret, 'utf8') < 32) throw new Error('report write Lambda refused: credential secret must be at least 256 bits');
  const store = new LocalWriteStore(dependencies.storeRoot);
  const knownSpotIds = new Set(dependencies.knownSpotIds);
  return {
    async handle(request): Promise<LocalWriteResponse> {
      if (request.method !== 'POST') return error(405, 'method_not_allowed', 'Solo se aceptan envíos POST.', 'La ruta de escritura no expone lecturas.', 'Envía el registro con POST.');
      if (!isJson(header(request.headers, 'content-type'))) return error(400, 'schema_invalid', 'El reporte debe enviarse como JSON.', 'El servidor necesita leer el registro con su formato acordado.', 'Envía el reporte con Content-Type application/json.');
      try {
        if (request.path === '/api/mint') return await mint(request, store, dependencies.credentialSecret, dependencies.clock);
        return await submit(request, store, knownSpotIds, dependencies.credentialSecret, dependencies.clock);
      } catch {
        return error(503, 'store_unavailable', 'No pudimos guardar el reporte ahora.', 'El almacenamiento local de escritura no está disponible.', 'Conserva el reporte y vuelve a intentar cuando el servicio responda.');
      }
    },
  };
}

async function mint(
  request: LocalWriteRequest,
  store: LocalWriteStore,
  secret: string,
  clock: () => Date,
): Promise<LocalWriteResponse> {
  const payload = parseBody(request.body, MAX_MINT_BYTES);
  if (payload === null || !isDeviceId(payload.device_id)) {
    return error(400, 'device_id_malformed', 'El identificador del dispositivo no tiene el formato esperado.', 'La credencial debe quedar unida a un dispositivo válido.', 'Crea un identificador d_ de 32 caracteres hexadecimales y vuelve a intentar.');
  }
  const now = clock();
  const epoch = Math.floor(now.getTime() / 1000);
  const deviceId = payload.device_id;
  const credential = await store.mintCredential({
    device_id: deviceId,
    issued_at: now.toISOString(),
    issued_at_epoch: epoch,
    src_hash: sourceHash(secret, request.sourceIp),
  });
  return ok({
    credential: signCredential(secret, credential.device_id, credential.issued_at_epoch),
    issued_at: credential.issued_at,
  });
}

async function submit(
  request: LocalWriteRequest,
  store: LocalWriteStore,
  knownSpotIds: ReadonlySet<string>,
  secret: string,
  clock: () => Date,
): Promise<LocalWriteResponse> {
  if (Buffer.byteLength(request.body, 'utf8') > MAX_REPORT_BYTES) {
    return error(413, 'payload_too_large', 'El reporte es demasiado grande.', 'El servidor solo acepta el registro breve del surfista.', 'Quita datos adicionales y conserva solo las respuestas del reporte.');
  }
  const payload = parseBody(request.body, MAX_REPORT_BYTES);
  const record = payload === null ? null : parseReport(payload);
  if (record === null) return error(400, 'schema_invalid', 'El reporte no tiene los datos esperados.', 'Solo las respuestas y sus formatos acordados pueden quedar inmóviles.', 'Vuelve a enviar el reporte guardado sin cambiarlo.');

  const credential = verifyCredential(header(request.headers, 'x-surf-credential'), secret);
  if (credential === 'missing') return error(401, 'credential_missing', 'Este teléfono todavía no tiene una credencial.', 'La credencial confirma cuándo apareció el dispositivo.', 'Obtén una credencial en /api/mint y vuelve a intentar.');
  if (credential === null) return error(401, 'credential_invalid', 'La credencial de este teléfono no es válida.', 'El reporte debe quedar unido a una credencial firmada por el servidor.', 'Obtén una credencial nueva en /api/mint y vuelve a intentar.');
  if (!knownSpotIds.has(record.spot_id)) return error(400, 'unknown_spot', 'La playa indicada no es conocida.', 'Solo podemos guardar reportes de playas publicadas.', 'Elige una playa de la lista de Surfs Up Panama.');

  const now = clock();
  const observed = Date.parse(record.observed_at);
  if (observed < now.getTime() - MAX_BACKDATE_MILLISECONDS || observed > now.getTime() + MAX_FUTURE_SKEW_MILLISECONDS) {
    return error(400, 'observed_at_out_of_range', 'La hora del reporte no parece correcta.', 'La hora debe estar cerca de la hora actual para que la observación sea honesta.', 'Corrige la hora del teléfono y vuelve a enviar el reporte guardado.');
  }

  const result = await store.storeReport(
    record,
    credential.deviceId,
    utcDay(now),
    DAILY_REPORT_LIMIT,
    now.toISOString(),
    new Date(credential.issuedAtEpoch * 1000).toISOString(),
  );
  if (result.kind === 'quota_exceeded') {
    return error(429, 'quota_exceeded', 'Este dispositivo ya llegó a su límite de hoy.', 'El límite diario protege los reportes de la comunidad.', 'Deja el reporte guardado y vuelve a intentar mañana.', { 'retry-after': secondsUntilNextUtcDay(now).toString() });
  }
  return ok(result.receipt);
}

function parseBody(body: string, maximumBytes: number): Record<string, unknown> | null {
  if (Buffer.byteLength(body, 'utf8') > maximumBytes) return null;
  try {
    const parsed: unknown = JSON.parse(body);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseReport(value: Record<string, unknown>): ReportRecord | null {
  if (Object.keys(value).some((key) => !reportFields.has(key))) return null;
  const { report_id, spot_id, observed_at, submitted_at, size_band, size_band_schema, wind, quality, trigger, photo_ids } = value;
  if (!isUlid(report_id) || !isText(spot_id) || !isUtcSecond(observed_at) || !isUtcSecond(submitted_at)) return null;
  if (size_band_schema !== SIZE_BAND_SCHEMA || typeof size_band !== 'string' || !sizeBandTokens.has(size_band)) return null;
  if (typeof wind !== 'string' || !windTokens.has(wind) || typeof quality !== 'string' || !qualityTokens.has(quality)) return null;
  if (trigger !== 'organic' && trigger !== 'push_solicited') return null;
  if (!Array.isArray(photo_ids) || !photo_ids.every(isText)) return null;
  if (value.queued_offline !== undefined && typeof value.queued_offline !== 'boolean') return null;
  if (value.lang !== undefined && typeof value.lang !== 'string') return null;
  return {
    report_id,
    spot_id,
    observed_at,
    submitted_at,
    size_band: size_band as SizeBandToken,
    size_band_schema: SIZE_BAND_SCHEMA,
    wind: wind as WindStateToken,
    quality: quality as QualityToken,
    trigger: trigger as ReportTrigger,
    photo_ids,
  };
}

function verifyCredential(value: string | undefined, secret: string): { readonly deviceId: string; readonly issuedAtEpoch: number } | null | 'missing' {
  if (value === undefined || value.length === 0) return 'missing';
  const pieces = value.split('.');
  const [version, deviceId, epoch, signature] = pieces;
  if (pieces.length !== 4 || version !== 'v1' || !isDeviceId(deviceId) || !/^\d+$/.test(epoch ?? '') || signature === undefined) return null;
  const expected = signCredential(secret, deviceId, Number(epoch));
  if (!safeEqual(value, expected)) return null;
  return { deviceId, issuedAtEpoch: Number(epoch) };
}

function signCredential(secret: string, deviceId: string, issuedAtEpoch: number): string {
  const message = `v1.${deviceId}.${issuedAtEpoch}`;
  return `${message}.${hmac(secret, message)}`;
}

function hmac(secret: string, message: string): string {
  return createHmac('sha256', secret).update(message).digest('base64url');
}

function sourceHash(secret: string, sourceIp: string): string {
  return createHmac('sha256', secret).update(sourceIp).digest('hex').slice(0, 32);
}

function safeEqual(left: string, right: string): boolean {
  const first = Buffer.from(left);
  const second = Buffer.from(right);
  return first.length === second.length && timingSafeEqual(first, second);
}

function utcDay(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

function secondsUntilNextUtcDay(now: Date): number {
  const tomorrow = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((tomorrow - now.getTime()) / 1000));
}

function header(headers: Readonly<Record<string, string | undefined>>, name: string): string | undefined {
  return Object.entries(headers).find(([key]) => key.toLowerCase() === name)?.[1];
}

function error(statusCode: number, code: string, what: string, why: string, how: string, headers?: Readonly<Record<string, string>>): LocalWriteResponse {
  const body = { error: { code, what, why, how } };
  return headers === undefined ? { statusCode, body } : { statusCode, headers, body };
}

function ok(body: Receipt | { readonly credential: string; readonly issued_at: string }): LocalWriteResponse {
  return { statusCode: 200, body };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isDeviceId(value: unknown): value is string {
  return typeof value === 'string' && DEVICE_PATTERN.test(value);
}

function isUlid(value: unknown): value is string {
  return typeof value === 'string' && ULID_PATTERN.test(value);
}

function isUtcSecond(value: unknown): value is string {
  return typeof value === 'string' && ISO_UTC_SECOND_PATTERN.test(value) && !Number.isNaN(Date.parse(value));
}

function isJson(value: string | undefined): boolean {
  return value === 'application/json' || value?.startsWith('application/json;') === true;
}
