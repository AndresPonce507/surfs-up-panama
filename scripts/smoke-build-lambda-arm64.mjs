#!/usr/bin/env node
// Reproducible deploy gate for the Build Lambda. CDK must stage the exact
// Linux ARM64 asset it would upload, then the AWS Node 22 ARM64 image imports
// and runs that asset against local S3 and CloudFront-shaped HTTP ports.

import { execFileSync, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cdkOut = join(repoRoot, 'cdk.out');
const buildFunctionName = 'surfs-up-panama-build';
// AWS Lambda ZIP limits: 50 MiB uploaded and 250 MiB uncompressed, including
// layers. This function has no layers. Lower project budgets preserve room for
// Astro upgrades before an AWS hard refusal.
const awsZipLimitBytes = 50 * 1024 * 1024;
const awsUnpackedLimitBytes = 250 * 1024 * 1024;
const projectZipBudgetBytes = 45 * 1024 * 1024;
const projectUnpackedBudgetBytes = 200 * 1024 * 1024;

if (process.argv.includes('--inside-lambda-runtime')) {
  await runInsideLambdaRuntime();
} else {
  await synthesize();
  const assetDirectory = await stagedBuildAssetDirectory();
  const sizes = await packageSizes(assetDirectory);
  assertSize('zipped', sizes.zippedBytes, projectZipBudgetBytes, awsZipLimitBytes);
  assertSize('unpacked', sizes.unpackedBytes, projectUnpackedBudgetBytes, awsUnpackedLimitBytes);
  await smokeInLambdaRuntime(assetDirectory);
  console.log(JSON.stringify({
    result: 'PASS',
    architecture: 'linux/arm64',
    artifact: assetDirectory,
    zip_bytes: sizes.zippedBytes,
    unpacked_bytes: sizes.unpackedBytes,
    project_zip_budget_bytes: projectZipBudgetBytes,
    project_unpacked_budget_bytes: projectUnpackedBudgetBytes,
    aws_zip_limit_bytes: awsZipLimitBytes,
    aws_unpacked_limit_bytes: awsUnpackedLimitBytes,
  }));
}

async function synthesize() {
  execFileSync(process.execPath, [join(repoRoot, 'node_modules/aws-cdk/bin/cdk'), 'synth', '--quiet'], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
}

async function stagedBuildAssetDirectory() {
  const template = JSON.parse(await readFile(join(cdkOut, 'SurfsUpPanamaIngest.template.json'), 'utf8'));
  const resource = Object.values(template.Resources ?? {}).find((candidate) => (
    candidate?.Type === 'AWS::Lambda::Function'
    && candidate.Properties?.FunctionName === buildFunctionName
  ));
  const key = resource?.Properties?.Code?.S3Key;
  if (typeof key !== 'string' || !key.endsWith('.zip')) {
    throw new Error(`ARM64 package smoke refused: CDK did not stage a ZIP asset for ${buildFunctionName}.`);
  }
  const asset = join(cdkOut, `asset.${key.slice(0, -'.zip'.length)}`);
  const details = await stat(asset).catch(() => undefined);
  if (!details?.isDirectory()) throw new Error(`ARM64 package smoke refused: expected staged asset ${asset}.`);
  return asset;
}

async function packageSizes(assetDirectory) {
  const temporary = await mkdtemp(join(tmpdir(), 'surfs-up-build-lambda-zip-'));
  const archive = join(temporary, 'build.zip');
  try {
    execFileSync('zip', ['-q', '-r', archive, '.'], { cwd: assetDirectory });
    return { zippedBytes: (await stat(archive)).size, unpackedBytes: await directoryBytes(assetDirectory) };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function directoryBytes(directory) {
  let bytes = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) bytes += await directoryBytes(path);
    else if (entry.isFile()) bytes += (await stat(path)).size;
  }
  return bytes;
}

function assertSize(kind, actual, projectBudget, awsLimit) {
  if (actual > awsLimit) {
    throw new Error(`ARM64 package smoke refused: ${kind} package ${actual} B exceeds AWS Lambda's ${awsLimit} B hard limit.`);
  }
  if (actual > projectBudget) {
    throw new Error(`ARM64 package smoke refused: ${kind} package ${actual} B exceeds this project's ${projectBudget} B budget before AWS's ${awsLimit} B hard limit.`);
  }
}

async function smokeInLambdaRuntime(assetDirectory) {
  const script = fileURLToPath(import.meta.url);
  const result = spawnSync('docker', [
    'run', '--rm', '--platform', 'linux/arm64',
    // Match the actual Node 22 Lambda runtime rather than the image's
    // generic shell environment. Its SDK v3 lives at this ESM search path;
    // the deployment asset intentionally leaves that runtime-provided SDK
    // external so the ZIP stays under Lambda's 50 MiB ceiling.
    '--entrypoint', '/var/lang/bin/node',
    '-e', 'NODE_PATH=/var/runtime/node_modules',
    // S3Client uses virtual-hosted bucket addressing against the fixture
    // endpoint (`fixture.fixture.localhost`); the public-manifest probe uses
    // the endpoint directly. Map both to the in-container fixture server.
    '--add-host', 'fixture.localhost:127.0.0.1',
    '--add-host', 'fixture.fixture.localhost:127.0.0.1',
    '-v', `${assetDirectory}:/var/task:ro`,
    '-v', `${script}:/opt/build-lambda-smoke.mjs:ro`,
    'public.ecr.aws/lambda/nodejs:22', '/opt/build-lambda-smoke.mjs', '--inside-lambda-runtime',
  ], { cwd: repoRoot, encoding: 'utf8' });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`ARM64 package smoke refused: Lambda runtime exited ${String(result.status)}.`);
}

async function runInsideLambdaRuntime() {
  const objects = new Map();
  const policy = JSON.parse(await readFile('/var/task/data/spots/pa-pacific-launch-v1.json', 'utf8'));
  const dates = ['2026-08-10', '2026-08-11'];
  for (const [spotIndex, spotId] of policy.launch_spot_ids.entries()) {
    for (const date of dates) {
      const rows = ['ncep_gfswave016', 'ncep_gfswave025', 'meteofrance_wave', 'dwd_gwam'].map((source) => JSON.stringify({
        spot_id: spotId,
        source,
        run_ts: '2026-08-10T06:00Z',
        valid_ts: `${date}T18:00Z`,
        lead_h: 12,
        // Reverse the wave-height ordering tomorrow. The production builder
        // rejects a stale tomorrow route whose ranking duplicates today, so a
        // valid package smoke must exercise the publishing path with a real
        // day-to-day forecast distinction.
        swell_h_m: date === dates[0] ? 0.8 + spotIndex / 20 : 1.8 - spotIndex / 20,
        swell_t_s: 14,
        swell_dir_deg: 180,
        wind_speed_kt: 8,
        wind_dir_deg: 40,
        tide_m: 2,
        tide_day_low_m: 0.5,
        tide_day_high_m: 3.5,
        land_masked: false,
      })).join('\n');
      objects.set(`predictions/v1/dt=${date}/${spotId}.jsonl`, Buffer.from(rows));
    }
  }

  const publicRequests = [];
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://fixture.localhost');
    const key = decodeURIComponent(url.pathname.replace(/^\/(?:fixture\/)?/, ''));
    if (request.method === 'GET' && url.searchParams.get('list-type') === '2') {
      const prefix = url.searchParams.get('prefix') ?? '';
      const contents = [...objects.keys()].filter((candidate) => candidate.startsWith(prefix))
        .sort().map((candidate) => `<Contents><Key>${candidate}</Key></Contents>`).join('');
      response.writeHead(200, { 'content-type': 'application/xml' });
      response.end(`<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">${contents}<IsTruncated>false</IsTruncated></ListBucketResult>`);
      return;
    }
    if (request.method === 'GET' && key === 'manifest.json') publicRequests.push(key);
    if (request.method === 'GET') {
      const body = objects.get(key);
      if (body === undefined) {
        response.writeHead(404, { 'content-type': 'application/xml' });
        response.end('<Error><Code>NoSuchKey</Code></Error>');
      } else {
        response.writeHead(200, { 'content-type': key === 'manifest.json' ? 'application/json' : 'application/octet-stream' });
        response.end(body);
      }
      return;
    }
    if (request.method === 'PUT') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      objects.set(key, Buffer.concat(chunks));
      response.writeHead(200, { ETag: '"fixture"' });
      response.end();
      return;
    }
    response.writeHead(405).end();
  });
  await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('fixture server did not expose a TCP port.');
  const endpoint = `http://fixture.localhost:${address.port}`;
  Object.assign(process.env, {
    AWS_ACCESS_KEY_ID: 'fixture',
    AWS_SECRET_ACCESS_KEY: 'fixture',
    AWS_REGION: 'us-east-1',
    AWS_ENDPOINT_URL_S3: endpoint,
    BUCKET_NAME: 'fixture',
    PUBLIC_SITE_ORIGIN: endpoint,
    STATIC_SITE_SOURCE_ROOT: '/var/task',
  });
  try {
    const build = await import(pathToFileURL('/var/task/index.mjs').href);
    const response = await build.handler();
    if (response.statusCode !== 200) throw new Error(`Build handler returned ${response.statusCode}, expected 200.`);
    for (const key of ['site/index.html', 'site/spots/playa-venao.html', 'manifest.json']) {
      if (!objects.has(key)) throw new Error(`Build handler did not publish ${key}.`);
    }
    if (!publicRequests.includes('manifest.json')) throw new Error('Build handler never reached the fixture CloudFront manifest probe.');
    console.log(JSON.stringify({ result: 'ARM64_HANDLER_PASS', routes: [...objects.keys()].filter((key) => key.startsWith('site/') && key.endsWith('.html')).length }));
  } finally {
    await new Promise((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise()));
  }
}
