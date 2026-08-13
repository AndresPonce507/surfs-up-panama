#!/usr/bin/env node
// Deploy gate: synthesize the exact Build asset, enforce Lambda package
// budgets, then run it in the Node 22 Linux ARM64 Lambda runtime. The smoke
// owns only the S3 receipt -> bundle/manifest path; it never changes the
// current static-surface contract.

import { execFileSync, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cdkOut = join(repoRoot, 'cdk.out');
const buildFunctionName = 'surfs-up-panama-build';
const awsZipLimitBytes = 50 * 1024 * 1024;
const awsUnpackedLimitBytes = 250 * 1024 * 1024;
const projectZipBudgetBytes = 45 * 1024 * 1024;
const projectUnpackedBudgetBytes = 200 * 1024 * 1024;

if (process.argv.includes('--inside-lambda-runtime')) {
  await runInsideLambdaRuntime();
} else {
  synthesize();
  const assetDirectory = await stagedBuildAssetDirectory();
  const sizes = await packageSizes(assetDirectory);
  assertSize('zipped', sizes.zippedBytes, projectZipBudgetBytes, awsZipLimitBytes);
  assertSize('unpacked', sizes.unpackedBytes, projectUnpackedBudgetBytes, awsUnpackedLimitBytes);
  await smokeInLambdaRuntime(assetDirectory);
  console.log(JSON.stringify({ result: 'PASS', architecture: 'linux/arm64', artifact: assetDirectory, ...sizes }));
}

function synthesize() {
  execFileSync(process.execPath, [join(repoRoot, 'node_modules/aws-cdk/bin/cdk'), 'synth', '--quiet'], { cwd: repoRoot, stdio: 'inherit' });
}

async function stagedBuildAssetDirectory() {
  const template = JSON.parse(await readFile(join(cdkOut, 'SurfsUpPanamaIngest.template.json'), 'utf8'));
  const resource = Object.values(template.Resources ?? {}).find((candidate) => (
    candidate?.Type === 'AWS::Lambda::Function' && candidate.Properties?.FunctionName === buildFunctionName
  ));
  const key = resource?.Properties?.Code?.S3Key;
  if (typeof key !== 'string' || !key.endsWith('.zip')) throw new Error(`ARM64 package smoke refused: CDK did not stage ${buildFunctionName}.`);
  const asset = join(cdkOut, `asset.${key.slice(0, -'.zip'.length)}`);
  if (!(await stat(asset)).isDirectory()) throw new Error(`ARM64 package smoke refused: expected staged asset ${asset}.`);
  return asset;
}

async function packageSizes(assetDirectory) {
  const temporary = await mkdtemp(join(tmpdir(), 'surfs-up-build-lambda-zip-'));
  const archive = join(temporary, 'build.zip');
  try {
    execFileSync('zip', ['-q', '-r', archive, '.'], { cwd: assetDirectory });
    return { zip_bytes: (await stat(archive)).size, unpacked_bytes: await directoryBytes(assetDirectory) };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function directoryBytes(directory) {
  let bytes = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) bytes += await directoryBytes(path);
    if (entry.isFile()) bytes += (await stat(path)).size;
  }
  return bytes;
}

function assertSize(kind, actual, projectBudget, awsLimit) {
  if (actual > awsLimit) throw new Error(`ARM64 package smoke refused: ${kind} package ${actual} B exceeds AWS Lambda's ${awsLimit} B hard limit.`);
  if (actual > projectBudget) throw new Error(`ARM64 package smoke refused: ${kind} package ${actual} B exceeds the ${projectBudget} B project budget.`);
}

async function smokeInLambdaRuntime(assetDirectory) {
  const script = fileURLToPath(import.meta.url);
  const result = spawnSync('docker', [
    'run', '--rm', '--platform', 'linux/arm64', '--entrypoint', '/var/lang/bin/node',
    '-e', 'NODE_PATH=/var/runtime/node_modules',
    '--add-host', 'fixture.localhost:127.0.0.1', '--add-host', 'fixture.fixture.localhost:127.0.0.1',
    '-v', `${assetDirectory}:/var/task:ro`, '-v', `${script}:/opt/build-lambda-smoke.mjs:ro`,
    'public.ecr.aws/lambda/nodejs:22', '/opt/build-lambda-smoke.mjs', '--inside-lambda-runtime',
  ], { cwd: repoRoot, encoding: 'utf8' });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`ARM64 package smoke refused: Lambda runtime exited ${String(result.status)}.`);
}

async function runInsideLambdaRuntime() {
  const objects = predictionFixtures();
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://fixture.localhost');
    const key = decodeURIComponent(url.pathname.replace(/^\/(?:fixture\/)?/, ''));
    if (request.method === 'GET' && url.searchParams.get('list-type') === '2') {
      const prefix = url.searchParams.get('prefix') ?? '';
      const contents = [...objects.keys()].filter((candidate) => candidate.startsWith(prefix)).sort()
        .map((candidate) => `<Contents><Key>${candidate}</Key></Contents>`).join('');
      response.writeHead(200, { 'content-type': 'application/xml' });
      response.end(`<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">${contents}<IsTruncated>false</IsTruncated></ListBucketResult>`);
      return;
    }
    if (request.method === 'GET') {
      const body = objects.get(key);
      if (body === undefined) { response.writeHead(404); response.end('<Error><Code>NoSuchKey</Code></Error>'); return; }
      response.writeHead(200); response.end(body); return;
    }
    if (request.method === 'PUT') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      objects.set(key, Buffer.concat(chunks));
      response.writeHead(200, { ETag: '"fixture"' }); response.end(); return;
    }
    response.writeHead(405).end();
  });
  await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('fixture server did not expose a TCP port.');
  Object.assign(process.env, {
    AWS_ACCESS_KEY_ID: 'fixture', AWS_SECRET_ACCESS_KEY: 'fixture', AWS_REGION: 'us-east-1',
    AWS_ENDPOINT_URL_S3: `http://fixture.localhost:${address.port}`, BUCKET_NAME: 'fixture',
    PUBLIC_SITE_ORIGIN: `http://fixture.localhost:${address.port}`,
    // The deployed environment carries the Publisher's name beside
    // BUCKET_NAME (ingest-stack), and the handler's composition refuses
    // loudly without it. The Lambda endpoint override keeps the handoff
    // attempt inside this fixture: the fixture answers the invoke POST with
    // 405, the SDK rejects (maxAttempts 1, one attempt), and the handler
    // writes down health.publish.handoff_failed without erasing the build --
    // exactly the deployed behavior when the Publisher is unreachable.
    PUBLISH_FUNCTION_NAME: 'surfs-up-panama-publish',
    AWS_ENDPOINT_URL_LAMBDA: `http://fixture.localhost:${address.port}`,
  });
  try {
    const build = await import(pathToFileURL('/var/task/index.mjs').href);
    const response = await build.handler();
    if (response.statusCode !== 200) throw new Error(`Build handler returned ${response.statusCode}, expected 200.`);
    for (const key of ['v1/regions/pa-pacific/bundle.json', 'v1/meta/spot-index.json', 'manifest.json']) {
      if (!objects.has(key)) throw new Error(`Build handler did not publish ${key}.`);
    }
    console.log(JSON.stringify({ result: 'ARM64_HANDLER_PASS' }));
  } finally {
    await new Promise((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise()));
  }
}

function predictionFixtures() {
  const objects = new Map();
  const policy = JSON.parse(readFileSync('/var/task/data/spots/pa-pacific-launch-v1.json', 'utf8'));
  const [today, tomorrow] = panamaDates(new Date());
  for (const [spotIndex, spotId] of policy.launch_spot_ids.entries()) {
    for (const date of [today, tomorrow]) {
      const rows = ['ncep_gfswave016', 'ncep_gfswave025', 'meteofrance_wave', 'dwd_gwam'].map((source) => JSON.stringify({
        spot_id: spotId, source, run_ts: '2026-08-10T06:00Z', valid_ts: `${date}T18:00Z`, lead_h: 12,
        fetched_ts: `${today}T06:17:00.000Z`, swell_h_m: date === today ? 0.8 + spotIndex / 20 : 1.8 - spotIndex / 20,
        swell_t_s: 14, swell_dir_deg: 180, swell2_h_m: null, swell2_t_s: null, swell2_dir_deg: null,
        wind_speed_kt: 8, wind_dir_deg: 40, tide_m: 2, tide_day_low_m: 0.5, tide_day_high_m: 3.5, land_masked: false,
      })).join('\n');
      objects.set(`predictions/v1/dt=${date}/${spotId}.jsonl.gz`, gzipSync(rows));
    }
  }
  return objects;
}

function panamaDates(now) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Panama', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  const tomorrow = new Date(`${today}T12:00:00.000Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return [today, tomorrow.toISOString().slice(0, 10)];
}
