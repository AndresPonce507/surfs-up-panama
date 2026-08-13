// The local report journey the Slice-03 to Slice-05 acceptance contract needs
// at REPORT_ACCEPTANCE_ORIGIN.
//
// WHY-NEW-FILE: scripts/report-acceptance-host.ts
//   CLOSEST-EXISTING: tests/acceptance/f-tell-us-what-you-saw-cold/steps/support/world.ts
//   EXTENSION-COST: world.ts registers Cucumber Before/After/AfterAll hooks at
//     module scope, so importing it from a standalone process throws before a
//     single line of its server code runs. Splitting the server out of it would
//     edit the driving surface that Slice-01 and the local Slice-03 scenarios
//     already pass through, for a lane whose job is to add evidence, not to
//     move a green seam.
//   PARALLEL-RATIONALE: this process must outlive a Cucumber run and be
//     addressable by an environment variable that the suite deliberately gives
//     no default (distill/red-classification.md: "no default local route"), so
//     it has a different lifecycle from anything under tests/.
//
// docs/architecture/atdd-infrastructure-policy.md, "Report journey": until a
// deployment exists, a locally run PRODUCTION handler wired to its real local
// store is permitted evidence. So every decision here is production code:
//
//   - createWriteLambda            the real mint/report decision core
//   - LocalWriteStore              the real durable filesystem write store
//   - resolveReportReveal          the real published-call read adapter
//   - serializeSpotIndex           the real generated spot index
//
// This file owns only the composition and a static file server. It never
// fabricates a receipt, a refusal, a credential or a comparison. Credentials
// are minted by POSTing the real /api/mint, and the quota device is filled by
// POSTing real reports through the real /api/report, so a 429 observed later is
// a real quota boundary rather than a forged status.
//
// Usage:
//   npx tsx scripts/report-acceptance-host.ts [--calls <root>|--no-calls]
//                                             [--out-env <path>] [--quiet]
//
// --calls   root holding real `log/calls/v1/...` artifacts written by
//           `npm run pipeline:build` (default `.pipeline-out`). This is the
//           compared environment.
// --no-calls  serve with an empty call-log root: a genuinely absent call, which
//           is the honest no-comparison environment. Not a forged response.

import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { gunzipSync } from 'node:zlib';

import { loadLaunchSpotSeeds } from '../src/data/launch-spots';
import { loadLaunchSpotCoordinates } from '../src/pipeline/adapters/spot-coordinates';
import { serializeSpotIndex } from '../src/pipeline/static-publication';
import { resolveReportReveal, type SpotIndexEntry } from '../src/report/call-log-reader';
import { createWriteLambda, type LocalWriteLambda } from '../src/report/local-lambda';
import { LocalWriteStore } from '../src/report/local-write-store';
import { mintReportId } from '../src/report/ulid';

const REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url));
const DIST_ROOT = resolve(REPOSITORY_ROOT, 'dist');
const REPORT_SPOT = 'playa-venao';
/** The quota device is filled on another beach so Playa Venao's counter stays honest. */
const QUOTA_FILL_SPOT = 'punta-chame';
const DAILY_REPORT_LIMIT = 20;

const execFileAsync = promisify(execFile);

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
};

/**
 * The deployed artifact is files on S3 behind CloudFront with
 * `build.format: 'file'`, so an extensionless route resolves to its `.html`
 * document and nothing else. Same mapping world.ts serves, for the same
 * reason: `astro preview` resolves directory URLs itself and hides a whole
 * class of hosting bug.
 */
function resolveDocument(pathname: string, distRoot: string): string | null {
  const decoded = decodeURIComponent(pathname);
  const safe = normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  if (safe.includes('..')) return null;
  const candidates = safe === '/' || safe === ''
    ? ['index.html']
    : safe.endsWith('/') ? [`${safe.replace(/\/+$/, '')}.html`] : [safe, `${safe}.html`];
  for (const candidate of candidates) {
    const path = resolve(distRoot, candidate.replace(/^\//, ''));
    if (!path.startsWith(distRoot)) return null;
    if (existsSync(path) && statSync(path).isFile()) return path;
  }
  return null;
}

/** The production call-log read port, over real artifacts on this disk. */
function createFilesystemCallLogReader(callLogRoot: string): { get(key: string): Promise<string | null> } {
  const cache = new Map<string, string | null>();
  return {
    async get(key) {
      const cached = cache.get(key);
      if (cached !== undefined) return cached;
      const body = await readCallObject(resolve(callLogRoot, key));
      cache.set(key, body);
      return body;
    },
  };
}

/** Mirrors the deployed adapter's magic-byte gunzip (src/report/aws-lambda-adapter.ts). */
async function readCallObject(path: string): Promise<string | null> {
  try {
    const contents = await readFile(path);
    if (contents[0] === 0x1f && contents[1] === 0x8b) return gunzipSync(contents).toString('utf8');
    return contents.toString('utf8');
  } catch {
    return null;
  }
}

function knownSpotIndex(): Readonly<Record<string, SpotIndexEntry>> {
  const index = JSON.parse(serializeSpotIndex(loadLaunchSpotSeeds(), loadLaunchSpotCoordinates())) as {
    readonly schema: string;
    readonly spots: Readonly<Record<string, SpotIndexEntry>>;
  };
  if (index.schema !== 'spot-index/1') throw new Error(`report acceptance host refused: unexpected spot index schema ${index.schema}`);
  if (index.spots[REPORT_SPOT] === undefined) throw new Error(`report acceptance host refused: spot index lacks ${REPORT_SPOT}`);
  return index.spots;
}

async function serveWrite(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  pathname: '/api/mint' | '/api/report',
  writeLambda: LocalWriteLambda,
): Promise<void> {
  const result = await writeLambda.handle({
    path: pathname,
    method: request.method ?? 'GET',
    headers: Object.fromEntries(
      Object.entries(request.headers).map(([name, value]) => [name, Array.isArray(value) ? value.join(', ') : value]),
    ),
    body: await requestBody(request),
    sourceIp: request.socket.remoteAddress ?? '127.0.0.1',
  });
  response.writeHead(result.statusCode, {
    ...result.headers,
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(result.body));
}

function requestBody(request: http.IncomingMessage): Promise<string> {
  return new Promise((resolveBody, rejectBody) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    request.on('error', rejectBody);
  });
}

function deviceId(): string {
  return `d_${randomBytes(16).toString('hex')}`;
}

function utcSecond(instant: Date): string {
  return `${instant.toISOString().slice(0, 19)}Z`;
}

/** Mints through the real /api/mint, so the credential is the handler's own. */
async function mintThroughHandler(origin: string, device: string): Promise<string> {
  const response = await fetch(`${origin}/api/mint`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ device_id: device }),
  });
  const body = await response.json() as { credential?: unknown };
  if (!response.ok || typeof body.credential !== 'string') {
    throw new Error(`report acceptance host refused: /api/mint answered ${response.status} ${JSON.stringify(body)}`);
  }
  return body.credential;
}

/**
 * Fills a real device's real daily allowance by sending real reports through
 * the real handler. Nothing about the later 429 is manufactured: the store
 * genuinely holds this device's twenty reports for this UTC day.
 */
async function fillDailyAllowance(origin: string, credential: string): Promise<void> {
  for (let sent = 0; sent < DAILY_REPORT_LIMIT; sent += 1) {
    const now = new Date();
    const response = await fetch(`${origin}/api/report`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-surf-credential': credential },
      body: JSON.stringify({
        report_id: mintReportId(now, Math.random),
        spot_id: QUOTA_FILL_SPOT,
        observed_at: utcSecond(now),
        submitted_at: utcSecond(now),
        size_band: 'waist_chest',
        size_band_schema: 1,
        wind: 'choppy',
        quality: 'good',
        trigger: 'organic',
        photo_ids: [],
      }),
    });
    if (response.status !== 200) {
      throw new Error(`report acceptance host refused: filling the daily allowance stopped at ${sent} with ${response.status} ${await response.text()}`);
    }
  }
}

type Options = Readonly<{ callLogRoot: string | null; envFile: string | null; quiet: boolean }>;

function parseOptions(argv: readonly string[]): Options {
  const value = (name: string): string | null => {
    const index = argv.indexOf(name);
    return index >= 0 && index + 1 < argv.length ? argv[index + 1]! : null;
  };
  return {
    callLogRoot: argv.includes('--no-calls') ? null : resolve(REPOSITORY_ROOT, value('--calls') ?? '.pipeline-out'),
    envFile: value('--out-env'),
    quiet: argv.includes('--quiet'),
  };
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const storeRoot = await mkdtemp(join(tmpdir(), 'report-acceptance-store-'));
  const emptyCallLogRoot = options.callLogRoot === null ? await mkdtemp(join(tmpdir(), 'report-acceptance-nocalls-')) : null;
  const callLogRoot = options.callLogRoot ?? emptyCallLogRoot!;
  const spots = knownSpotIndex();

  const writeLambda = createWriteLambda({
    store: new LocalWriteStore(storeRoot),
    credentialSecret: randomBytes(32).toString('base64url'),
    knownSpotIds: Object.keys(spots),
    clock: () => new Date(),
    resolveReveal: (record) => resolveReportReveal(record, spots, createFilesystemCallLogReader(callLogRoot)),
  });

  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    if (pathname === '/api/mint' || pathname === '/api/report') {
      void serveWrite(request, response, pathname, writeLambda).catch(() => {
        response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
        response.end('{"error":{"code":"host_failed"}}');
      });
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('method not allowed');
      return;
    }
    const document = resolveDocument(pathname, DIST_ROOT);
    if (document === null) {
      const notFound = resolve(DIST_ROOT, '404.html');
      response.writeHead(404, { 'content-type': existsSync(notFound) ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8' });
      if (existsSync(notFound)) createReadStream(notFound).pipe(response); else response.end('not found');
      return;
    }
    response.writeHead(200, { 'content-type': CONTENT_TYPES[extname(document)] ?? 'application/octet-stream' });
    createReadStream(document).pipe(response);
  });

  // Bind first, build second: the page's endpoints are baked into the static
  // artifact at build time, so the port has to exist before `npm run build`.
  await new Promise<void>((listening, failed) => {
    server.once('error', failed);
    server.listen(0, '127.0.0.1', listening);
  });
  const address = server.address();
  if (address === null || typeof address !== 'object') throw new Error('report acceptance host refused: the server has no address');
  const origin = `http://127.0.0.1:${address.port}`;

  const { PUBLIC_REPORT_MINT_URL: _mint, PUBLIC_REPORT_SUBMIT_URL: _submit, ...baseEnvironment } = process.env;
  const build = await execFileAsync('npm', ['run', 'build'], {
    cwd: REPOSITORY_ROOT,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...baseEnvironment, PUBLIC_REPORT_MINT_URL: `${origin}/api/mint`, PUBLIC_REPORT_SUBMIT_URL: `${origin}/api/report` },
  }).catch((error: { stdout?: string; stderr?: string; message?: string }) => {
    throw new Error(`report acceptance host refused: npm run build failed.\n${error.stdout ?? ''}\n${error.stderr ?? ''}\n${error.message ?? ''}`);
  });
  if (!options.quiet) process.stdout.write(`${build.stdout.split('\n').slice(-3).join('\n')}\n`);

  const credential = await mintThroughHandler(origin, deviceId());
  const quotaDevice = deviceId();
  const quotaCredential = await mintThroughHandler(origin, quotaDevice);
  await fillDailyAllowance(origin, quotaCredential);

  const environment = {
    REPORT_ACCEPTANCE_ORIGIN: origin,
    REPORT_ACCEPTANCE_CREDENTIAL: credential,
    REPORT_ACCEPTANCE_QUOTA_CREDENTIAL: quotaCredential,
    ...(options.callLogRoot === null ? {} : { REPORT_ACCEPTANCE_PUBLISHED_ARTIFACT: join(callLogRoot, 'log/calls/v1') }),
  };
  const exports = Object.entries(environment).map(([name, value]) => `export ${name}=${JSON.stringify(value)}`).join('\n');
  if (options.envFile !== null) await writeFile(resolve(REPOSITORY_ROOT, options.envFile), `${exports}\n`, 'utf8');
  process.stdout.write(`${exports}\n`);
  process.stdout.write(`# call log: ${options.callLogRoot === null ? 'ABSENT (honest no-comparison environment)' : callLogRoot}\n`);
  process.stdout.write(`# write store: ${storeRoot}\n`);
  process.stdout.write('# ready\n');

  const shutdown = async (): Promise<void> => {
    server.close();
    await rm(storeRoot, { recursive: true, force: true });
    if (emptyCallLogRoot !== null) await rm(emptyCallLogRoot, { recursive: true, force: true });
    process.exit(0);
  };
  process.on('SIGINT', () => { void shutdown(); });
  process.on('SIGTERM', () => { void shutdown(); });
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
