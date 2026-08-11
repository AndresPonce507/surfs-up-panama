// src/report/aws-write-store.ts
function createAwsWriteStore(client, commands, tableName) {
  return {
    async mintCredential(candidate) {
      const key = credentialKey(candidate.device_id);
      try {
        await client.send(new commands.PutCommand({
          TableName: tableName,
          Item: { pk: key.pk, sk: key.sk, ...candidate },
          ConditionExpression: "attribute_not_exists(pk) AND attribute_not_exists(sk)"
        }));
        return candidate;
      } catch (error2) {
        if (!isConditionalFailure(error2)) throw error2;
        const existing = await client.send(new commands.GetCommand({ TableName: tableName, Key: key, ConsistentRead: true }));
        const item = existing.Item;
        if (item === void 0) throw error2;
        return {
          device_id: item.device_id,
          issued_at: item.issued_at,
          issued_at_epoch: item.issued_at_epoch,
          src_hash: item.src_hash
        };
      }
    },
    async storeReport(record, deviceId, receivedDay, quotaLimit, receivedAt, credentialIssuedAt, reveal) {
      const reportKey = reportKeys(record);
      try {
        await client.send(new commands.TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: tableName,
                Key: quotaKey(deviceId, receivedDay),
                UpdateExpression: "ADD reports :one SET ttl = :ttl",
                ConditionExpression: "attribute_not_exists(reports) OR reports < :limit",
                ExpressionAttributeValues: {
                  ":one": 1,
                  ":limit": quotaLimit,
                  ":ttl": Math.floor(Date.parse(receivedAt) / 1e3) + 2 * 24 * 60 * 60
                }
              }
            },
            {
              Put: {
                TableName: tableName,
                Item: {
                  ...reportKey,
                  report_id: record.report_id,
                  device_id: deviceId,
                  received_at: receivedAt,
                  credential_issued_at: credentialIssuedAt,
                  record
                },
                ConditionExpression: "attribute_not_exists(pk) AND attribute_not_exists(sk)"
              }
            }
          ]
        }));
      } catch (error2) {
        if (!isConditionalFailure(error2)) throw error2;
        const existing = await client.send(new commands.GetCommand({ TableName: tableName, Key: reportKey, ConsistentRead: true }));
        if (typeof existing.Item === "object" && existing.Item !== null) {
          const original = duplicateReceipt(existing.Item, record.report_id);
          if (original !== null) return { kind: "duplicate", receipt: original };
          throw new Error("report write store refused: duplicate receipt is not durable yet");
        }
        return { kind: "quota_exceeded" };
      }
      const counter = await client.send(new commands.UpdateCommand({
        TableName: tableName,
        Key: { pk: `SPOT#${record.spot_id}`, sk: "COUNTER" },
        UpdateExpression: "ADD n_reports :one",
        ExpressionAttributeValues: { ":one": 1 },
        ReturnValues: "UPDATED_NEW"
      }));
      const nReports = numberAt(counter.Attributes, "n_reports", 1);
      const canonical = receipt(record.report_id, nReports, reveal);
      await client.send(new commands.UpdateCommand({
        TableName: tableName,
        Key: reportKey,
        UpdateExpression: "SET receipt = :receipt",
        ConditionExpression: "attribute_exists(pk) AND attribute_exists(sk)",
        ExpressionAttributeValues: { ":receipt": canonical }
      }));
      return { kind: "accepted", receipt: canonical };
    }
  };
}
function credentialKey(deviceId) {
  return { pk: `CRED#${deviceId}`, sk: "MINT" };
}
function quotaKey(deviceId, day) {
  return { pk: `DEV#${deviceId}`, sk: `QUOTA#${day}` };
}
function reportKeys(record) {
  return { pk: `REP#${record.report_id}`, sk: "REPORT" };
}
function receipt(reportId, nReports, reveal) {
  return { ...reveal, report_id: reportId, counter: { n_reports: nReports, threshold: 30 } };
}
function duplicateReceipt(item, reportId) {
  const stored = item.receipt;
  if (typeof stored === "object" && stored !== null && "predicted" in stored && "counter" in stored) {
    const original = stored;
    return { ...original, outcome: "queued_duplicate", report_id: reportId };
  }
  return null;
}
function numberAt(value, key, fallback) {
  if (typeof value !== "object" || value === null || !(key in value)) return fallback;
  const found = value[key];
  return typeof found === "number" && Number.isFinite(found) ? found : fallback;
}
function isConditionalFailure(error2) {
  return typeof error2 === "object" && error2 !== null && "name" in error2 && (error2.name === "ConditionalCheckFailedException" || error2.name === "TransactionCanceledException");
}

// src/data/size-bands.ts
var sizeBands = [
  {
    value: "flat",
    lo_m: -Number.EPSILON,
    hi_m: 0.1,
    label: { es: "Plano", en: "Flat" }
  },
  {
    value: "ankle_knee",
    lo_m: 0.1,
    hi_m: 0.4,
    label: { es: "Tobillo a rodilla", en: "Ankle to knee" }
  },
  {
    value: "knee_waist",
    lo_m: 0.4,
    hi_m: 0.7,
    label: { es: "Rodilla a cintura", en: "Knee to waist" }
  },
  {
    value: "waist_chest",
    lo_m: 0.7,
    hi_m: 1.1,
    label: { es: "Cintura a pecho", en: "Waist to chest" }
  },
  {
    value: "chest_head",
    lo_m: 1.1,
    hi_m: 1.6,
    label: { es: "Pecho a cabeza", en: "Chest to head" }
  },
  {
    value: "head_overhead",
    lo_m: 1.6,
    hi_m: 2.4,
    label: { es: "Cabeza a un metro m\xE1s", en: "Head to overhead" }
  },
  {
    value: "double_overhead_plus",
    lo_m: 2.4,
    hi_m: Number.POSITIVE_INFINITY,
    label: { es: "Doble o m\xE1s", en: "Double overhead +" }
  }
];

// src/report/call-log-reader.ts
var qualityAnchors = { bad: 20, ok: 45, good: 70, epic: 90 };
var sizeBandIndexes = new Map(sizeBands.map(({ value }, index) => [value, index]));
async function resolveReportReveal(record, index, reader) {
  const spot = index[record.spot_id];
  if (spot === void 0) return noSnapshot();
  const observedHour = `${record.observed_at.slice(0, 13)}:00:00Z`;
  for (let offset = 0; offset <= 3; offset += 1) {
    const buildAt = new Date(Date.parse(observedHour) - offset * 60 * 60 * 1e3);
    const key = callKey(buildAt, spot.region_id);
    const content = await reader.get(key);
    if (content === null) continue;
    const call = content.split("\n").map(parseCall).find((candidate) => candidate !== null && candidate.spot_id === record.spot_id && candidate.valid_ts === observedHour);
    if (call === void 0) continue;
    const observedScore = qualityAnchors[record.quality];
    const predictedBand = sizeBandIndexes.get(call.size_band);
    const observedBand = sizeBandIndexes.get(record.size_band);
    if (observedScore === void 0 || predictedBand === void 0 || observedBand === void 0) return noSnapshot();
    return {
      outcome: "compared",
      predicted: {
        score_q: call.score_q,
        size_band: call.size_band,
        size_range_m: call.size_range_m,
        wind_state: call.wind_state,
        conf_level: call.conf_level
      },
      delta: { score_points: call.score_q - observedScore, size_bands: predictedBand - observedBand }
    };
  }
  return noSnapshot();
}
function callKey(buildAt, regionId) {
  const date = buildAt.toISOString().slice(0, 10);
  const hour = buildAt.toISOString().slice(11, 13);
  return `log/calls/v1/dt=${date}/build=${hour}Z/${regionId}.jsonl.gz`;
}
function parseCall(line) {
  try {
    const value = JSON.parse(line);
    if (typeof value.spot_id !== "string" || typeof value.valid_ts !== "string" || typeof value.score_q !== "number" || typeof value.size_band !== "string" || !Array.isArray(value.size_range_m) || value.size_range_m.length !== 2 || !value.size_range_m.every((part) => typeof part === "number") || typeof value.wind_state !== "string" || typeof value.conf_level !== "string") return null;
    return value;
  } catch {
    return null;
  }
}
function noSnapshot() {
  return { outcome: "no_snapshot", predicted: null };
}

// src/report/local-lambda.ts
import { createHmac, timingSafeEqual } from "node:crypto";

// src/data/report-vocab.ts
var WIND_STATE_TOKENS = ["clean", "choppy", "blown_out"];
var QUALITY_TOKENS = ["bad", "ok", "good", "epic"];

// src/report/report-record.ts
var SIZE_BAND_SCHEMA = 1;

// src/report/local-lambda.ts
var DEVICE_PATTERN = /^d_[0-9a-f]{32}$/;
var ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;
var ISO_UTC_SECOND_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
var MAX_REPORT_BYTES = 4 * 1024;
var MAX_MINT_BYTES = 1024;
var DAILY_REPORT_LIMIT = 20;
var MAX_BACKDATE_MILLISECONDS = (12 * 60 + 15) * 60 * 1e3;
var MAX_FUTURE_SKEW_MILLISECONDS = 15 * 60 * 1e3;
var sizeBandTokens = new Set(sizeBands.map(({ value }) => value));
var windTokens = new Set(WIND_STATE_TOKENS);
var qualityTokens = new Set(QUALITY_TOKENS);
var reportFields = /* @__PURE__ */ new Set([
  "report_id",
  "spot_id",
  "observed_at",
  "submitted_at",
  "size_band",
  "size_band_schema",
  "wind",
  "quality",
  "trigger",
  "photo_ids",
  "queued_offline",
  "lang"
]);
function createWriteLambda(dependencies) {
  if (Buffer.byteLength(dependencies.credentialSecret, "utf8") < 32) throw new Error("report write Lambda refused: credential secret must be at least 256 bits");
  const store = dependencies.store;
  const knownSpotIds = new Set(dependencies.knownSpotIds);
  return {
    async handle(request) {
      if (request.method !== "POST") return error(405, "method_not_allowed", "Solo se aceptan env\xEDos POST.", "La ruta de escritura no expone lecturas.", "Env\xEDa el registro con POST.");
      if (!isJson(header(request.headers, "content-type"))) return error(400, "schema_invalid", "El reporte debe enviarse como JSON.", "El servidor necesita leer el registro con su formato acordado.", "Env\xEDa el reporte con Content-Type application/json.");
      try {
        if (request.path === "/api/mint") return await mint(request, store, dependencies.credentialSecret, dependencies.clock);
        return await submit(request, store, knownSpotIds, dependencies.credentialSecret, dependencies.clock, dependencies.resolveReveal ?? noSnapshot2);
      } catch {
        return error(503, "store_unavailable", "No pudimos guardar el reporte ahora.", "El almacenamiento local de escritura no est\xE1 disponible.", "Conserva el reporte y vuelve a intentar cuando el servicio responda.");
      }
    }
  };
}
async function mint(request, store, secret, clock) {
  const payload = parseBody(request.body, MAX_MINT_BYTES);
  if (payload === null || !isDeviceId(payload.device_id)) {
    return error(400, "device_id_malformed", "El identificador del dispositivo no tiene el formato esperado.", "La credencial debe quedar unida a un dispositivo v\xE1lido.", "Crea un identificador d_ de 32 caracteres hexadecimales y vuelve a intentar.");
  }
  const now = clock();
  const epoch = Math.floor(now.getTime() / 1e3);
  const deviceId = payload.device_id;
  const credential = await store.mintCredential({
    device_id: deviceId,
    issued_at: now.toISOString(),
    issued_at_epoch: epoch,
    src_hash: sourceHash(secret, request.sourceIp)
  });
  return ok({
    credential: signCredential(secret, credential.device_id, credential.issued_at_epoch),
    issued_at: credential.issued_at
  });
}
async function submit(request, store, knownSpotIds, secret, clock, resolveReveal) {
  if (Buffer.byteLength(request.body, "utf8") > MAX_REPORT_BYTES) {
    return error(413, "payload_too_large", "El reporte es demasiado grande.", "El servidor solo acepta el registro breve del surfista.", "Quita datos adicionales y conserva solo las respuestas del reporte.");
  }
  const payload = parseBody(request.body, MAX_REPORT_BYTES);
  const record = payload === null ? null : parseReport(payload);
  if (record === null) return error(400, "schema_invalid", "El reporte no tiene los datos esperados.", "Solo las respuestas y sus formatos acordados pueden quedar inm\xF3viles.", "Vuelve a enviar el reporte guardado sin cambiarlo.");
  const credential = verifyCredential(header(request.headers, "x-surf-credential"), secret);
  if (credential === "missing") return error(401, "credential_missing", "Este tel\xE9fono todav\xEDa no tiene una credencial.", "La credencial confirma cu\xE1ndo apareci\xF3 el dispositivo.", "Obt\xE9n una credencial en /api/mint y vuelve a intentar.");
  if (credential === null) return error(401, "credential_invalid", "La credencial de este tel\xE9fono no es v\xE1lida.", "El reporte debe quedar unido a una credencial firmada por el servidor.", "Obt\xE9n una credencial nueva en /api/mint y vuelve a intentar.");
  if (!knownSpotIds.has(record.spot_id)) return error(400, "unknown_spot", "La playa indicada no es conocida.", "Solo podemos guardar reportes de playas publicadas.", "Elige una playa de la lista de Surfs Up Panama.");
  const now = clock();
  const observed = Date.parse(record.observed_at);
  if (observed < now.getTime() - MAX_BACKDATE_MILLISECONDS || observed > now.getTime() + MAX_FUTURE_SKEW_MILLISECONDS) {
    return error(400, "observed_at_out_of_range", "La hora del reporte no parece correcta.", "La hora debe estar cerca de la hora actual para que la observaci\xF3n sea honesta.", "Corrige la hora del tel\xE9fono y vuelve a enviar el reporte guardado.");
  }
  const result = await store.storeReport(
    record,
    credential.deviceId,
    utcDay(now),
    DAILY_REPORT_LIMIT,
    now.toISOString(),
    new Date(credential.issuedAtEpoch * 1e3).toISOString(),
    await resolveReveal(record)
  );
  if (result.kind === "quota_exceeded") {
    return error(429, "quota_exceeded", "Este dispositivo ya lleg\xF3 a su l\xEDmite de hoy.", "El l\xEDmite diario protege los reportes de la comunidad.", "Deja el reporte guardado y vuelve a intentar ma\xF1ana.", { "retry-after": secondsUntilNextUtcDay(now).toString() });
  }
  return ok(result.receipt);
}
async function noSnapshot2() {
  return { outcome: "no_snapshot", predicted: null };
}
function parseBody(body, maximumBytes) {
  if (Buffer.byteLength(body, "utf8") > maximumBytes) return null;
  try {
    const parsed = JSON.parse(body);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
function parseReport(value) {
  if (Object.keys(value).some((key) => !reportFields.has(key))) return null;
  const { report_id, spot_id, observed_at, submitted_at, size_band, size_band_schema, wind, quality, trigger, photo_ids } = value;
  if (!isUlid(report_id) || !isText(spot_id) || !isUtcSecond(observed_at) || !isUtcSecond(submitted_at)) return null;
  if (size_band_schema !== SIZE_BAND_SCHEMA || typeof size_band !== "string" || !sizeBandTokens.has(size_band)) return null;
  if (typeof wind !== "string" || !windTokens.has(wind) || typeof quality !== "string" || !qualityTokens.has(quality)) return null;
  if (trigger !== "organic" && trigger !== "push_solicited") return null;
  if (!Array.isArray(photo_ids) || !photo_ids.every(isText)) return null;
  if (value.queued_offline !== void 0 && typeof value.queued_offline !== "boolean") return null;
  if (value.lang !== void 0 && typeof value.lang !== "string") return null;
  return {
    report_id,
    spot_id,
    observed_at,
    submitted_at,
    size_band,
    size_band_schema: SIZE_BAND_SCHEMA,
    wind,
    quality,
    trigger,
    photo_ids
  };
}
function verifyCredential(value, secret) {
  if (value === void 0 || value.length === 0) return "missing";
  const pieces = value.split(".");
  const [version, deviceId, epoch, signature] = pieces;
  if (pieces.length !== 4 || version !== "v1" || !isDeviceId(deviceId) || !/^\d+$/.test(epoch ?? "") || signature === void 0) return null;
  const expected = signCredential(secret, deviceId, Number(epoch));
  if (!safeEqual(value, expected)) return null;
  return { deviceId, issuedAtEpoch: Number(epoch) };
}
function signCredential(secret, deviceId, issuedAtEpoch) {
  const message = `v1.${deviceId}.${issuedAtEpoch}`;
  return `${message}.${hmac(secret, message)}`;
}
function hmac(secret, message) {
  return createHmac("sha256", secret).update(message).digest("base64url");
}
function sourceHash(secret, sourceIp) {
  return createHmac("sha256", secret).update(sourceIp).digest("hex").slice(0, 32);
}
function safeEqual(left, right) {
  const first = Buffer.from(left);
  const second = Buffer.from(right);
  return first.length === second.length && timingSafeEqual(first, second);
}
function utcDay(instant) {
  return instant.toISOString().slice(0, 10);
}
function secondsUntilNextUtcDay(now) {
  const tomorrow = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((tomorrow - now.getTime()) / 1e3));
}
function header(headers, name) {
  return Object.entries(headers).find(([key]) => key.toLowerCase() === name)?.[1];
}
function error(statusCode, code, what, why, how, headers) {
  const body = { error: { code, what, why, how } };
  return headers === void 0 ? { statusCode, body } : { statusCode, headers, body };
}
function ok(body) {
  return { statusCode: 200, body };
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isText(value) {
  return typeof value === "string" && value.length > 0;
}
function isDeviceId(value) {
  return typeof value === "string" && DEVICE_PATTERN.test(value);
}
function isUlid(value) {
  return typeof value === "string" && ULID_PATTERN.test(value);
}
function isUtcSecond(value) {
  return typeof value === "string" && ISO_UTC_SECOND_PATTERN.test(value) && !Number.isNaN(Date.parse(value));
}
function isJson(value) {
  return value === "application/json" || value?.startsWith("application/json;") === true;
}

// src/report/aws-lambda-adapter.ts
var composition;
async function handler(event) {
  const writeLambda = composition ??= createComposition();
  const expectedPath = requiredEnvironment("WRITE_PATH");
  if (event.rawPath !== void 0 && event.rawPath !== expectedPath && event.rawPath !== "/") {
    return response(404, { error: { code: "not_found", what: "La ruta de escritura no existe.", why: "Cada Function URL tiene una sola operaci\xF3n.", how: "Usa la URL publicada por el sitio." } });
  }
  const result = await (await writeLambda).handle({
    path: expectedPath,
    method: event.requestContext?.http?.method ?? "",
    headers: event.headers ?? {},
    body: event.body ?? "",
    sourceIp: event.requestContext?.http?.sourceIp ?? ""
  });
  return response(result.statusCode, result.body, result.headers);
}
async function createComposition() {
  const [dynamo, document, s3, ssm] = await Promise.all([
    loadSdk("@aws-sdk/client-dynamodb"),
    loadSdk("@aws-sdk/lib-dynamodb"),
    loadSdk("@aws-sdk/client-s3"),
    loadSdk("@aws-sdk/client-ssm")
  ]);
  const DynamoDBClient = constructor(dynamo, "DynamoDBClient");
  const rawDynamoClient = new DynamoDBClient({});
  const DynamoDBDocumentClient = document.DynamoDBDocumentClient;
  const documentClient = DynamoDBDocumentClient.from(rawDynamoClient);
  const DescribeTableCommand = constructor(dynamo, "DescribeTableCommand");
  const GetParameterCommand = constructor(ssm, "GetParameterCommand");
  const GetObjectCommand = constructor(s3, "GetObjectCommand");
  const s3Client = new s3.S3Client({});
  const parameterRequest = send(
    new GetParameterCommand({ Name: requiredEnvironment("CREDENTIAL_HMAC_PARAMETER"), WithDecryption: true }),
    new ssm.SSMClient({})
  );
  const spotRequest = requiredEnvironment("WRITE_PATH") === "/api/report" ? send(new GetObjectCommand({ Bucket: requiredEnvironment("SITE_BUCKET"), Key: "pub/v1/meta/spot-index.json" }), s3Client) : Promise.resolve(void 0);
  const tableProbe = send(new DescribeTableCommand({ TableName: requiredEnvironment("WRITE_STORE_TABLE") }), rawDynamoClient);
  const [parameter, spotObject, described] = await Promise.all([parameterRequest, spotRequest, tableProbe]);
  requireProvisionedTable(described);
  const secret = readString(parameter.Parameter, "Value");
  const index = spotObject === void 0 ? { spots: {} } : JSON.parse(await objectBody(spotObject.Body));
  const knownSpotIds = Object.keys(index.spots ?? {});
  const commands = {
    GetCommand: constructor(document, "GetCommand"),
    PutCommand: constructor(document, "PutCommand"),
    TransactWriteCommand: constructor(document, "TransactWriteCommand"),
    UpdateCommand: constructor(document, "UpdateCommand")
  };
  const callCache = /* @__PURE__ */ new Map();
  return createWriteLambda({
    store: createAwsWriteStore(documentClient, commands, requiredEnvironment("WRITE_STORE_TABLE")),
    credentialSecret: secret,
    knownSpotIds,
    clock: () => /* @__PURE__ */ new Date(),
    resolveReveal: (record) => resolveReportReveal(record, index.spots ?? {}, {
      async get(key) {
        const cached = callCache.get(key);
        if (cached !== void 0) return cached;
        try {
          const object = await send(new GetObjectCommand({ Bucket: requiredEnvironment("SITE_BUCKET"), Key: key }), s3Client);
          const body = await objectBody(object.Body);
          callCache.set(key, body);
          return body;
        } catch {
          callCache.set(key, null);
          return null;
        }
      }
    })
  });
}
async function loadSdk(name) {
  return import(name);
}
function constructor(module, name) {
  const value = module[name];
  if (typeof value !== "function") throw new Error(`report write Lambda refused: ${name} SDK constructor is unavailable`);
  return value;
}
async function send(command, client) {
  return client.send(command);
}
function readString(value, key) {
  if (typeof value !== "object" || value === null) throw new Error(`report write Lambda refused: ${key} is absent`);
  const found = value[key];
  if (typeof found !== "string" || found.length === 0) throw new Error(`report write Lambda refused: ${key} is absent`);
  return found;
}
async function objectBody(body) {
  if (typeof body !== "object" || body === null) throw new Error("report write Lambda refused: S3 body is unavailable");
  if ("transformToByteArray" in body) {
    const bytes = await body.transformToByteArray();
    const contents = Buffer.from(bytes);
    if (contents[0] === 31 && contents[1] === 139) return (await import("node:zlib")).gunzipSync(contents).toString("utf8");
    return contents.toString("utf8");
  }
  if ("transformToString" in body) return body.transformToString();
  throw new Error("report write Lambda refused: S3 body is unavailable");
}
function requiredEnvironment(name) {
  const value = process.env[name];
  if (value === void 0 || value.length === 0) throw new Error(`report write Lambda refused: ${name} is unset`);
  return value;
}
function requireProvisionedTable(described) {
  const table = typeof described === "object" && described !== null ? described.Table : void 0;
  if (typeof table !== "object" || table === null) throw new Error("report write Lambda refused: write table does not exist");
  const details = table;
  const mode = details.BillingModeSummary;
  const throughput = details.ProvisionedThroughput;
  if (mode?.BillingMode === "PAY_PER_REQUEST" || throughput === void 0) throw new Error("report write Lambda refused: write table is not PROVISIONED");
}
function response(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body)
  };
}
export {
  handler
};
