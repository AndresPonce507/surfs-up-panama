// Driving port for the POST /api/push Function URL. It owns untrusted HTTP
// parsing, credential verification and the narrow subscription-store port;
// DynamoDB and browser APIs remain outside this decision boundary.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { isAllowedHost } from './push-hosts';

export type PushWriteRequest = {
  readonly method: string;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body: string;
};

export type PushWriteResponse = {
  readonly statusCode: number;
  readonly body: unknown;
};

export type StoredPushSubscription = {
  readonly spot_id: string;
  readonly endpoint_hash: string;
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
  readonly lang: string;
  readonly threshold_score: number | null;
  readonly last_notified_date: string | null;
  readonly followup_date: string | null;
  readonly device_id: string;
};

export interface PushStore {
  subscribe(subscription: StoredPushSubscription, receivedDay: string): Promise<'stored' | 'quota_exceeded' | 'ownership_conflict'>;
  unsubscribe(spotId: string, endpointHash: string, deviceId: string): Promise<void>;
  read(spotId: string, endpointHash: string, deviceId: string): Promise<StoredPushSubscription | null>;
}

export type PushLambdaDependencies = {
  readonly store: PushStore;
  readonly credentialSecret: string;
  readonly knownSpotIds: readonly string[];
  readonly allowlist: readonly string[];
  readonly clock: () => Date;
};

export interface PushLambda {
  handle(request: PushWriteRequest): Promise<PushWriteResponse>;
}

const MAX_PUSH_BYTES = 2 * 1024;
const DEVICE_PATTERN = /^d_[0-9a-f]{32}$/;
const PUSH_FIELDS = new Set(['action', 'spot_id', 'subscription', 'lang', 'threshold_score', 'endpoint']);

type Credential = { readonly deviceId: string };

export function createPushLambda(dependencies: PushLambdaDependencies): PushLambda {
  const knownSpotIds = new Set(dependencies.knownSpotIds);
  return {
    async handle(request): Promise<PushWriteResponse> {
      if (request.method !== 'POST') return error(405, 'method_not_allowed', 'Solo se aceptan solicitudes POST.', 'La ruta de avisos no expone lecturas GET.', 'Usa la acción de avisos desde la página del spot.');
      if (!isJson(header(request.headers, 'content-type'))) return error(400, 'schema_invalid', 'Los avisos deben enviarse como JSON.', 'El servidor necesita leer la suscripción con el formato acordado.', 'Vuelve a pedir los avisos desde la página del spot.');
      if (Buffer.byteLength(request.body, 'utf8') > MAX_PUSH_BYTES) return error(413, 'payload_too_large', 'La suscripción es demasiado grande.', 'Solo guardamos las claves breves que entrega el navegador.', 'Vuelve a pedir los avisos desde el mismo navegador.');

      const credential = verifyCredential(header(request.headers, 'x-surf-credential'), dependencies.credentialSecret);
      if (credential === 'missing') return error(401, 'credential_missing', 'Este teléfono todavía no tiene una credencial.', 'La suscripción tiene que quedar ligada a un teléfono válido.', 'Abre la página del spot y vuelve a pedir los avisos.');
      if (credential === null) return error(401, 'credential_invalid', 'La credencial de este teléfono no es válida.', 'Solo el servidor puede confirmar de qué teléfono llegó la suscripción.', 'Vuelve a abrir la página y pide los avisos otra vez.');

      const body = parseBody(request.body);
      if (body === null) return error(400, 'schema_invalid', 'La suscripción no tiene los datos esperados.', 'Solo las acciones y claves acordadas se pueden guardar.', 'Vuelve a pedir los avisos desde la página del spot.');
      const common = parseCommon(body, knownSpotIds);
      if (common === null) return error(400, 'schema_invalid', 'La suscripción no tiene un spot o una acción válida.', 'El servidor solo guarda avisos para playas publicadas.', 'Vuelve a pedir los avisos desde la página de una playa publicada.');

      const endpoint = textAt(body, 'endpoint') ?? endpointOf(body);
      if (endpoint === null) return error(400, 'schema_invalid', 'La suscripción no trae un destino de avisos.', 'El navegador tiene que entregar su destino real.', 'Vuelve a pedir los avisos desde este navegador.');
      const parsedEndpoint = parseEndpoint(endpoint);
      if (parsedEndpoint === null || parsedEndpoint.protocol !== 'https:' || !isAllowedHost(parsedEndpoint.host, dependencies.allowlist)) {
        return error(
          400,
          'endpoint_not_allowed',
          `El destino ${endpoint} no es un servicio de avisos permitido.`,
          'Aceptar cualquier destino convertiría el servidor en un enviador de tráfico hacia una dirección ajena.',
          'Pide los avisos desde un navegador compatible con las notificaciones push.',
        );
      }
      const endpointHash = hashEndpoint(endpoint);

      try {
        if (common.action === 'unsubscribe') {
          await dependencies.store.unsubscribe(common.spotId, endpointHash, credential.deviceId);
          return ok({ status: 'unsubscribed' });
        }
        if (common.action === 'status') {
          const stored = await dependencies.store.read(common.spotId, endpointHash, credential.deviceId);
          return stored === null
            ? ok({ status: 'inactive' })
            : ok({ status: 'subscribed', threshold_score: stored.threshold_score });
        }

        const subscription = parseSubscribe(body, common.spotId, endpointHash, endpoint, credential.deviceId);
        if (subscription === null) return error(400, 'schema_invalid', 'La suscripción no trae claves válidas del navegador.', 'Sin esas claves no se puede cifrar un aviso para este teléfono.', 'Vuelve a pedir los avisos desde este navegador.');
        const outcome = await dependencies.store.subscribe(subscription, utcDay(dependencies.clock()));
        if (outcome === 'quota_exceeded') return error(429, 'quota_exceeded', 'Este teléfono ya llegó a su límite de cambios de avisos por hoy.', 'El límite protege la lista de avisos de escrituras automáticas.', 'Vuelve a intentarlo mañana.');
        if (outcome === 'ownership_conflict') return error(409, 'subscription_owned_elsewhere', 'Ese destino de avisos ya pertenece a otro teléfono.', 'Un teléfono no puede cambiar la suscripción guardada de otro.', 'Pide los avisos desde el teléfono que los creó.');
        return ok({ status: 'subscribed' });
      } catch {
        return error(503, 'store_unavailable', 'No pudimos guardar los avisos ahora.', 'El almacenamiento de suscripciones no respondió.', 'Intenta de nuevo en un momento.');
      }
    },
  };
}

function parseBody(body: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(body);
    return isRecord(value) && Object.keys(value).every((key) => PUSH_FIELDS.has(key)) ? value : null;
  } catch {
    return null;
  }
}

function parseCommon(value: Record<string, unknown>, knownSpotIds: ReadonlySet<string>): { action: 'subscribe' | 'unsubscribe' | 'status'; spotId: string } | null {
  const action = value.action;
  const spotId = value.spot_id;
  if ((action !== 'subscribe' && action !== 'unsubscribe' && action !== 'status') || typeof spotId !== 'string' || !knownSpotIds.has(spotId)) return null;
  return { action, spotId };
}

function endpointOf(value: Record<string, unknown>): string | null {
  if (!isRecord(value.subscription)) return null;
  return textAt(value.subscription, 'endpoint');
}

function parseSubscribe(
  value: Record<string, unknown>,
  spotId: string,
  endpointHash: string,
  endpoint: string,
  deviceId: string,
): StoredPushSubscription | null {
  if (!isRecord(value.subscription) || typeof value.lang !== 'string' || (value.lang !== 'es' && value.lang !== 'en')) return null;
  if (value.endpoint !== undefined) return null;
  const keys = value.subscription.keys;
  if (!isRecord(keys)) return null;
  const p256dh = textAt(keys, 'p256dh');
  const auth = textAt(keys, 'auth');
  if (p256dh === null || auth === null || !isP256dh(p256dh) || !isAuthSecret(auth)) return null;
  const threshold = value.threshold_score;
  if (threshold !== undefined && (typeof threshold !== 'number' || !Number.isInteger(threshold) || threshold < 0 || threshold > 100)) return null;
  return {
    spot_id: spotId,
    endpoint_hash: endpointHash,
    endpoint,
    p256dh,
    auth,
    lang: value.lang,
    threshold_score: typeof threshold === 'number' ? threshold : null,
    last_notified_date: null,
    followup_date: null,
    device_id: deviceId,
  };
}

function isP256dh(value: string): boolean {
  const bytes = decodeBase64Url(value);
  return bytes !== null && bytes.length === 65 && bytes[0] === 4;
}

function isAuthSecret(value: string): boolean {
  const bytes = decodeBase64Url(value);
  return bytes !== null && bytes.length === 16;
}

function decodeBase64Url(value: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const decoded = Buffer.from(value, 'base64url');
    return decoded.length === 0 ? null : decoded;
  } catch {
    return null;
  }
}

function hashEndpoint(endpoint: string): string {
  return createHash('sha256').update(endpoint).digest('hex').slice(0, 32);
}

function parseEndpoint(value: string): { readonly host: string; readonly protocol: string } | null {
  try {
    const url = new URL(value);
    return { host: url.hostname, protocol: url.protocol };
  } catch {
    return null;
  }
}

function verifyCredential(value: string | undefined, secret: string): Credential | null | 'missing' {
  if (value === undefined || value.length === 0) return 'missing';
  const pieces = value.split('.');
  const [version, deviceId, epoch] = pieces;
  if (pieces.length !== 4 || version !== 'v1' || !isDeviceId(deviceId) || !/^\d+$/.test(epoch ?? '')) return null;
  const message = `v1.${deviceId}.${epoch}`;
  const expected = `${message}.${createHmac('sha256', secret).update(message).digest('base64url')}`;
  return safeEqual(value, expected) ? { deviceId } : null;
}

function safeEqual(left: string, right: string): boolean {
  const first = Buffer.from(left);
  const second = Buffer.from(right);
  return first.length === second.length && timingSafeEqual(first, second);
}

function isDeviceId(value: unknown): value is string {
  return typeof value === 'string' && DEVICE_PATTERN.test(value);
}

function textAt(value: Record<string, unknown>, key: string): string | null {
  const found = value[key];
  return typeof found === 'string' && found.length > 0 ? found : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJson(value: string | undefined): boolean {
  return value?.toLowerCase().startsWith('application/json') === true;
}

function header(headers: Readonly<Record<string, string | undefined>>, name: string): string | undefined {
  return Object.entries(headers).find(([key]) => key.toLowerCase() === name)?.[1];
}

function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function ok(body: unknown): PushWriteResponse {
  return { statusCode: 200, body };
}

function error(statusCode: number, code: string, what: string, why: string, how: string): PushWriteResponse {
  return { statusCode, body: { error: { code, what, why, how } } };
}
