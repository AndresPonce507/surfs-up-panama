#!/usr/bin/env node
// Deploy-gate-adjacent smoke for the Publisher's container image
// (infra/lambda-images/publisher/Dockerfile, step 01-02). Step 02-02 owns
// the CDK wiring (DockerImageCode.fromImageAsset); this smoke owns proving
// the image itself: build it directly, then run the REAL composition root
// (src/pipeline/lambda/publish-handler.ts's runPublish, unmodified) inside
// the linux/arm64 container against fixture predictions and a stand-in
// object store + command runner. The risky part this smoke exists to prove
// is the real render: materializing the repo under /tmp at cold start and
// running the real `npm run build` (midnight verify included, never
// bypassed) inside the container -- a faked render would be a FAIL by the
// slice charter's own negative observation.
//
// What is real inside the container: the whole composition root
// (defaultStore, defaultRenderer's materialize + real `npm run build`,
// defaultCommandRunner), the S3 SDK client (pointed at an in-process HTTP
// fixture server, same trick as scripts/smoke-build-lambda-arm64.mjs). What
// is fake: that HTTP server standing in for S3, and the AWS credentials.
// The smoke does NOT invoke the image's own CMD/entrypoint bootstrap
// (publish-handler-bootstrap.mjs) -- like smoke-build-lambda-arm64.mjs, it
// overrides the entrypoint to prove the composition root directly. A
// second, cheap check below confirms the generated bootstrap module at
// least loads and exports a handler function; it does not invoke it.

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PUBLICATION_TARGETS } from './release/publication-target.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dockerfile = join(repoRoot, 'infra/lambda-images/publisher/Dockerfile');
const imageTag = 'surfs-up-panama-publisher-arm64-smoke:local';
// AWS Lambda's container image hard limit is 10 GiB uncompressed. This
// project budget is a generous sanity ceiling, not a tuned production
// target -- nothing about this image's actual size approaches either.
const awsContainerImageHardLimitBytes = 10 * 1024 * 1024 * 1024;
const projectImageBudgetBytes = 3 * 1024 * 1024 * 1024;

if (process.argv.includes('--inside-lambda-runtime')) {
  await runInsideLambdaRuntime();
} else {
  const buildMs = buildImage();
  const imageSizeBytes = imageSizeOf(imageTag);
  assertImageSize(imageSizeBytes);
  await assertBootstrapLoads();
  const evidence = await smokeInLambdaRuntime();
  console.log(JSON.stringify({
    result: 'PASS',
    architecture: 'linux/arm64',
    image: imageTag,
    image_build_ms: buildMs,
    image_size_bytes: imageSizeBytes,
    ...evidence,
  }));
}

function buildImage() {
  const startedAt = Date.now();
  execFileSync('docker', [
    'build', '--platform', 'linux/arm64',
    '-f', dockerfile,
    '-t', imageTag,
    repoRoot,
  ], { stdio: 'inherit' });
  return Date.now() - startedAt;
}

function imageSizeOf(tag) {
  const output = execFileSync('docker', ['image', 'inspect', tag, '--format', '{{.Size}}'], { encoding: 'utf8' });
  return Number.parseInt(output.trim(), 10);
}

function assertImageSize(actualBytes) {
  if (actualBytes > awsContainerImageHardLimitBytes) {
    throw new Error(`ARM64 publish smoke refused: image ${actualBytes} B exceeds AWS Lambda's ${awsContainerImageHardLimitBytes} B container image hard limit.`);
  }
  if (actualBytes > projectImageBudgetBytes) {
    throw new Error(`ARM64 publish smoke refused: image ${actualBytes} B exceeds the ${projectImageBudgetBytes} B project budget.`);
  }
}

/** Cheap partial coverage of the image's own CMD target: confirms the
 * generated bootstrap module loads and exports a handler function. It does
 * not invoke the Lambda Runtime Interface Client or call the handler --
 * that would require a full RIC event loop, out of scope for this smoke
 * (step 02-02's deploy proves the real invoke path). */
async function assertBootstrapLoads() {
  const result = spawnSync('docker', [
    'run', '--rm', '--platform', 'linux/arm64', '--entrypoint', '/var/lang/bin/node',
    imageTag, '-e', "import('/var/task/publish-handler-bootstrap.mjs').then(m => { if (typeof m.handler !== 'function') throw new Error('bootstrap exports no handler function'); console.log('bootstrap handler typeof: function'); })",
  ], { encoding: 'utf8' });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error('ARM64 publish smoke refused: the image CMD target (publish-handler-bootstrap.mjs) failed to load.');
}

async function smokeInLambdaRuntime() {
  // No bind mount needed: this very script is already inside the image at
  // its normal repository path (`COPY . .` copies scripts/ whole), so a
  // relative import like `./release/publication-target.mjs` resolves
  // exactly as it does on the host -- no host/container path mismatch.
  const bucket = PUBLICATION_TARGETS.production.bucket;
  const result = spawnSync('docker', [
    'run', '--rm', '--platform', 'linux/arm64', '--entrypoint', '/var/lang/bin/node',
    '--add-host', 'fixture.localhost:127.0.0.1',
    '--add-host', `${bucket}.fixture.localhost:127.0.0.1`,
    imageTag, '/var/task/scripts/smoke-publish-lambda-arm64.mjs', '--inside-lambda-runtime',
  ], { encoding: 'utf8' });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`ARM64 publish smoke refused: Lambda runtime exited ${String(result.status)}.`);
  const evidenceLine = result.stdout.split('\n').reverse().find((line) => line.trim().startsWith('{'));
  if (evidenceLine === undefined) throw new Error('ARM64 publish smoke refused: the in-container run printed no evidence line.');
  const evidence = JSON.parse(evidenceLine);
  if (evidence.result !== 'ARM64_PUBLISH_PASS') throw new Error(`ARM64 publish smoke refused: unexpected in-container result ${JSON.stringify(evidence)}.`);
  return evidence;
}

// ---------- runs inside the container (--inside-lambda-runtime) ----------

async function runInsideLambdaRuntime() {
  const objects = new Map();
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://fixture.localhost');
    const key = decodeURIComponent(url.pathname.replace(/^\/(?:fixture\/)?/, ''));
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

  // The midnight rule (`npm run build`'s `publish:surface --verify`) checks
  // the surface's civil day against the AMBIENT clock, exactly as it does
  // locally -- never bypassed. The fixture must therefore carry Panama's
  // real today/tomorrow, computed the same way
  // scripts/smoke-build-lambda-arm64.mjs does, not a hardcoded date.
  const [today, tomorrow] = panamaDates(new Date());
  const buildId = `b_${today}T00Z-smoke`;
  const bundleInvocationKey = 'pub/v1/regions/pa-pacific/bundle.json';
  // S3Store (adapters/s3-store.ts) strips the `pub/` prefix before hitting
  // the bucket; the fixture must be seeded under the key it will actually
  // receive the GET for.
  const bundleObjectKey = 'v1/regions/pa-pacific/bundle.json';
  objects.set(bundleObjectKey, Buffer.from(JSON.stringify(regionBundleFor(buildId, today, tomorrow))));

  Object.assign(process.env, {
    AWS_ACCESS_KEY_ID: 'fixture',
    AWS_SECRET_ACCESS_KEY: 'fixture',
    AWS_REGION: 'us-east-1',
    AWS_ENDPOINT_URL_S3: `http://fixture.localhost:${address.port}`,
    BUCKET_NAME: PUBLICATION_TARGETS.production.bucket,
    PUBLIC_SITE_ORIGIN: PUBLICATION_TARGETS.production.origin,
  });

  try {
    const { register } = await import('tsx/esm/api');
    register();
    const target = await import('/var/task/src/pipeline/lambda/publish-handler.ts');
    const answer = await target.runPublish({ build_id: buildId, bundle_key: bundleInvocationKey });
    if (answer.statusCode !== 200) {
      throw new Error(`Publish handler returned ${answer.statusCode}, expected 200. Objects seen: ${[...objects.keys()].join(', ')}`);
    }
    const archiveKey = 'site/published-surface.json';
    if (!objects.has(archiveKey)) throw new Error('Publish handler did not write the durable archive.');
    const uploadedPageKeys = [...objects.keys()].filter((key) => key !== bundleObjectKey && key !== archiveKey);
    if (uploadedPageKeys.length === 0) throw new Error('Publish handler uploaded no rendered pages.');
    if (!uploadedPageKeys.includes('.public-site-origin.json')) throw new Error('Publish handler did not upload the real astro build\'s origin receipt.');
    console.log(JSON.stringify({
      result: 'ARM64_PUBLISH_PASS',
      status_code: answer.statusCode,
      uploaded_object_count: uploadedPageKeys.length,
      panama_today: today,
      panama_tomorrow: tomorrow,
    }));
  } finally {
    await new Promise((resolvePromise, reject) => server.close((error) => (error ? reject(error) : resolvePromise())));
  }
}

/** Reuses the repository's own committed data/published-surface.json as the
 * fixture's per-spot content (all launch spots, real conf_level / size_band
 * / wind_state / best_window diversity) rather than hand-rolling values --
 * this project has already been burned once by a uniform/incomplete fixture
 * silently rendering `undefined` on 19 of 20 spot pages while every CI job
 * stayed green (project CLAUDE.md). Only the dates are retargeted to
 * Panama's real today/tomorrow, since the midnight verify checks those
 * against the ambient clock and must never be bypassed. */
function regionBundleFor(buildId, today, tomorrow) {
  const committed = JSON.parse(readFileSync('/var/task/data/published-surface.json', 'utf8'));
  const template = committed.current;
  const [todayTemplate, tomorrowTemplate] = template.days;
  const publishedAt = new Date().toISOString();
  const days = [
    { ...todayTemplate, date: today },
    { ...tomorrowTemplate, date: tomorrow },
  ];
  return {
    schema: 'region-bundle/1',
    region_id: 'pa-pacific',
    build_id: buildId,
    published_at: publishedAt,
    publish_surface: {
      schema: 'published-surface-update/v1',
      surf_date: today,
      published_at: publishedAt,
      build_kind: 'hourly',
      calls: days[0].spots,
      days,
    },
  };
}

function panamaDates(now) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Panama', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  const tomorrow = new Date(`${today}T12:00:00.000Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return [today, tomorrow.toISOString().slice(0, 10)];
}
