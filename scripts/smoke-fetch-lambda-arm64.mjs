#!/usr/bin/env node
// Target-runtime smoke for the staged Fetch asset. Its ports are injected so
// no AWS call occurs, while Lambda's Linux ARM64 Node 22 loader executes the
// exact artifact CDK would upload.

import { execFileSync, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cdkOut = join(root, 'cdk.out');
const functionName = 'surfs-up-panama-fetch';

if (process.argv.includes('--inside-lambda-runtime')) {
  const fetchLambda = await import(pathToFileURL('/var/task/index.mjs').href);
  const raw = [];
  const predictions = [];
  const source = {
    async fetchWavePayload() { return { ok: true, verbatim: '{}' }; },
    parseWaveMembers() { return { ok: true, data: [{ source: 'ncep_gfswave016', run_ts: '2026-08-11T06:00Z', hours: [{ valid_ts: '2026-08-11T18:00Z', swell: { h_m: 1, t_s: 12, dir_deg: 180 }, swell2: null, land_masked: false }] }] }; },
    async fetchWindPayload() { return { ok: false, reason: 'dark' }; }, parseWind() { return { ok: false, reason: 'dark' }; },
    async fetchTidePayload() { return { ok: false, reason: 'dark' }; }, parseTide() { return { ok: false, reason: 'dark' }; },
  };
  const store = { async putRawIfAbsent(record) { raw.push(record.key); return 'created'; }, async putPredictionIfAbsent(key) { predictions.push(key); return 'created'; } };
  const spot = { spot_id: 'playa-venao', name: 'Playa Venao', region_id: 'pa-pacific', timezone: 'America/Panama', shore_normal_deg: 180, swell_window_deg: [130, 230], h_ref_m: 1.3, s_size: 0.5, wind_optimum: { u_star_kt: 5, k_on_kt: 6, k_off_kt: 15, k_cross_kt: 12 }, tide: { optimum: 'mid_falling', sigma: 'wide', range_class: 'macrotidal' } };
  const outcome = await fetchLambda.runFetch({ source, store, spots: [spot], execution_id: 'arm64-smoke', clock: { now: () => new Date('2026-08-11T06:17:00Z') }, startup_probe: async () => {} });
  if (!outcome.completed || raw.length !== 1 || predictions.length !== 1) throw new Error('Fetch ARM64 smoke did not archive and persist a prediction.');
  console.log(JSON.stringify({ result: 'ARM64_FETCH_HANDLER_PASS' }));
} else {
  execFileSync(process.execPath, [join(root, 'node_modules/aws-cdk/bin/cdk'), 'synth', '--quiet'], { cwd: root, stdio: 'inherit' });
  const template = JSON.parse(await readFile(join(cdkOut, 'SurfsUpPanamaIngest.template.json'), 'utf8'));
  const resource = Object.values(template.Resources ?? {}).find((candidate) => candidate?.Type === 'AWS::Lambda::Function' && candidate.Properties?.FunctionName === functionName);
  const key = resource?.Properties?.Code?.S3Key;
  if (typeof key !== 'string' || !key.endsWith('.zip')) throw new Error('Fetch ARM64 smoke could not locate staged asset.');
  const asset = join(cdkOut, `asset.${key.slice(0, -'.zip'.length)}`);
  const script = fileURLToPath(import.meta.url);
  const result = spawnSync('docker', ['run', '--rm', '--platform', 'linux/arm64', '--entrypoint', '/var/lang/bin/node', '-e', 'NODE_PATH=/var/runtime/node_modules', '-v', `${asset}:/var/task:ro`, '-v', `${script}:/opt/fetch-smoke.mjs:ro`, 'public.ecr.aws/lambda/nodejs:22', '/opt/fetch-smoke.mjs', '--inside-lambda-runtime'], { cwd: root, encoding: 'utf8' });
  process.stdout.write(result.stdout); process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`Fetch ARM64 smoke failed with ${String(result.status)}.`);
}
