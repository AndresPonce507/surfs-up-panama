// Lambda composition root for the synchronous Publisher invoke (Build ->
// this handler, after build-handler.ts's manifest probe; wired by CDK in
// step 02-02). Wires the real, already-proven publish core
// (src/pipeline/publish-site.ts) to real adapters: the S3 store (reused
// from adapters/s3-store.ts), a renderer that materializes this repository
// in a writable /tmp copy and runs the real `npm run build` (midnight
// verify included, never bypassed), and a command runner that understands
// publishBuild's `aws s3api put-object` argv shape and performs the real S3
// PutObject. No publish logic lives here -- this file only wires ports and
// maps the outcome to an HTTP-shaped answer, the build-handler.ts
// runBuild(overrides) pattern.
//
// Honesty contract this file owns: it never touches any port before every
// required setting is present (WHAT/WHY/HOW refusal, requiredEnv's
// build-handler precedent), and it passes Build's invocation payload
// through unchanged -- the publisher answers only its build.

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { S3Store } from '../adapters/s3-store';
import { derivePublishLogLines } from './log-events';
import {
  runPublishOnce,
  type PublishCommandRunner,
  type PublishInvocation,
  type PublishOutcome,
  type PublishRenderer,
  type PublishStorePort,
} from '../publish-site';

const run = promisify(execFile);

/** This module's own repository-relative location (src/pipeline/lambda/),
 * resolved the same way as bundled-launch-seed-paths.ts so it stays correct
 * whether the file runs via tsx locally or copied whole into the container
 * image at the same relative path (infra/lambda-images/publisher/Dockerfile
 * copies the repository tree, never a bundled subset). */
const REPOSITORY_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** Directories the writable /tmp copy never needs: build output, VCS
 * history, and caches that must regenerate fresh under /tmp anyway. Mirrors
 * .dockerignore's list -- one list of intent, not two. */
const COPY_EXCLUDED_DIRECTORY_NAMES = new Set([
  'node_modules', '.git', 'dist', '.astro', 'cdk.out', '.pipeline-out', '.ci-local-logs',
]);

export type PublishPort = (invocation: PublishInvocation) => Promise<PublishOutcome>;

export type PublishHandlerOverrides = Readonly<{
  /** Read-only environment input (project policy:
   * contract:declared-inputs-not-ambient-reads) -- tests inject a plain
   * object; the real Lambda invocation falls back to process.env. */
  environment?: Record<string, string | undefined>;
  publish?: PublishPort;
}>;

const REQUIRED_ENVIRONMENT_VARIABLES = ['BUCKET_NAME', 'PUBLIC_SITE_ORIGIN'] as const;

function requiredEnv(environment: Record<string, string | undefined>, name: string): string {
  const value = environment[name];
  if (value === undefined || value === '') {
    throw new Error(
      `publish-handler refused: WHAT env var ${name} is missing; WHY the Lambda composition root needs it wired by CDK before any port is called; HOW set it on the Publisher function's environment when its CDK stack is wired (step 02-02).`,
    );
  }
  return value;
}

/** The driving port this Lambda exposes to tests, mirroring
 * build-handler.ts's runBuild(overrides). Validates every required setting
 * BEFORE constructing or calling any port -- a half-wired door never starts
 * the cycle behind it, and Build's invocation payload reaches the publish
 * port unchanged. */
export async function runPublish(
  event: PublishInvocation,
  overrides: PublishHandlerOverrides = {},
): Promise<{ readonly statusCode: number }> {
  const environment = overrides.environment ?? process.env;
  for (const name of REQUIRED_ENVIRONMENT_VARIABLES) requiredEnv(environment, name);

  const publish = overrides.publish ?? defaultPublish(environment);
  const outcome = await publish(event);

  // Honesty contract (ADR weather-to-site-bridge, decision step 5):
  // publish.success is only ever printed when every PUT completed;
  // refusals print publish.refused with the reason. Same
  // deriveBuildLogLines pattern build-handler.ts already prints from.
  for (const line of derivePublishLogLines(outcome)) console.log(JSON.stringify(line));

  return { statusCode: outcome.published ? 200 : 204 };
}

// Composition-root-only wiring below. Not covered directly by a unit test,
// same as build-handler.ts's defaultStore: the real path is proven by the
// ARM64 container smoke (scripts/smoke-publish-lambda-arm64.mjs) and, once
// deployed, by publish.success appearing in CloudWatch. Built lazily, only
// once every required setting is confirmed present, so no AWS client is
// ever constructed while a test double stands in for `publish`.

function defaultPublish(environment: Record<string, string | undefined>): PublishPort {
  const bucket = requiredEnv(environment, 'BUCKET_NAME');
  const publicSiteOrigin = requiredEnv(environment, 'PUBLIC_SITE_ORIGIN');
  const store = defaultStore(bucket);
  const renderer = defaultRenderer(publicSiteOrigin);
  const commandRunner = defaultCommandRunner();
  const clock = { now: () => new Date() };
  return (invocation) => runPublishOnce({ invocation, store, renderer, commandRunner, clock });
}

/** Reuses S3Store (adapters/s3-store.ts) rather than a second S3 client:
 * getCorrection/putManifest are already the plain, non-gzip, non-conditional
 * get/put this port needs, key mapping (`pub/` prefix) included. */
function defaultStore(bucket: string): PublishStorePort {
  const s3Store = new S3Store(new S3Client({}), bucket);
  return {
    get: (key) => s3Store.getCorrection(key),
    put: (key, body) => s3Store.putManifest(key, body),
  };
}

/** Materializes a writable copy of this repository under /tmp, writes the
 * merged surface where `npm run build`'s midnight verify reads it, then
 * runs the real build (verify + astro build) with PUBLIC_SITE_ORIGIN set to
 * the production origin. The midnight rule stays in the execution path --
 * a stale surface refuses here exactly as it does locally, never bypassed. */
function defaultRenderer(publicSiteOrigin: string): PublishRenderer {
  return async (mergedSurfaceJson) => {
    const projectDir = await materializeWritableProject();
    await writeFile(join(projectDir, 'data', 'published-surface.json'), mergedSurfaceJson);
    try {
      await run('npm', ['run', 'build'], {
        cwd: projectDir,
        env: { ...process.env, PUBLIC_SITE_ORIGIN: publicSiteOrigin },
      });
    } catch (error) {
      throw new Error(
        `publish-handler refused: WHAT npm run build failed inside the writable render copy (${renderFailure(error)}); `
          + `WHY the render owns the midnight verify and the real astro build, never bypassed; `
          + `HOW inspect the build output above -- a stale surface refusing is by design, a crashing build is not.`,
      );
    }
    return join(projectDir, 'dist');
  };
}

async function materializeWritableProject(): Promise<string> {
  const projectDir = await mkdtemp(join(tmpdir(), 'psb-publish-render-'));
  await cp(REPOSITORY_ROOT, projectDir, { recursive: true, filter: keepForRender });
  await symlinkNodeModules(join(REPOSITORY_ROOT, 'node_modules'), join(projectDir, 'node_modules'));
  return projectDir;
}

function keepForRender(source: string): boolean {
  const name = source.slice(source.lastIndexOf('/') + 1);
  return !COPY_EXCLUDED_DIRECTORY_NAMES.has(name);
}

/** Points the writable copy's node_modules at the image's already-installed
 * tree entry-by-entry, so a cold start never re-copies or reinstalls
 * dependencies. Only the top-level directory is real (writable): Vite and
 * Astro may still create their own cache directories inside it. */
async function symlinkNodeModules(imageNodeModules: string, projectNodeModules: string): Promise<void> {
  await mkdir(projectNodeModules, { recursive: true });
  for (const entry of await readdir(imageNodeModules)) {
    await symlink(join(imageNodeModules, entry), join(projectNodeModules, entry));
  }
}

/** The only command shape this adapter understands is the one
 * scripts/preview/publish-preview.mjs's publishBuild emits: `aws s3api
 * put-object --bucket <b> --key <k> --body <file-path> --content-type <ct>
 * --cache-control <cc>`. Reads the file at --body and performs the real
 * S3 PutObject; never a shell exec of the aws CLI itself. */
function defaultCommandRunner(): PublishCommandRunner {
  const client = new S3Client({});
  return async (command, args) => {
    if (command !== 'aws' || args[0] !== 's3api' || args[1] !== 'put-object') {
      throw new Error(
        `publish-handler refused: WHAT the command runner was asked to run "${command} ${args.join(' ')}"; `
          + `WHY the real adapter only understands publishBuild's aws s3api put-object argv shape; `
          + `HOW extend this adapter deliberately if scripts/preview/publish-preview.mjs's upload shape changes.`,
      );
    }
    const bucket = valueAfter(args, '--bucket');
    const key = valueAfter(args, '--key');
    const bodyPath = valueAfter(args, '--body');
    if (bucket === null || key === null || bodyPath === null) {
      throw new Error(
        `publish-handler refused: WHAT the put-object argv is missing --bucket, --key or --body (${args.join(' ')}); `
          + `WHY the real adapter reads the file named by --body and uploads it; `
          + `HOW keep publishBuild's argv shape unchanged.`,
      );
    }
    const contentType = valueAfter(args, '--content-type');
    const cacheControl = valueAfter(args, '--cache-control');
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: await readFile(bodyPath),
      ...(contentType !== null ? { ContentType: contentType } : {}),
      ...(cacheControl !== null ? { CacheControl: cacheControl } : {}),
    }));
    return undefined;
  };
}

function valueAfter(args: readonly string[], flag: string): string | null {
  const index = args.indexOf(flag);
  return index === -1 ? null : args[index + 1] ?? null;
}

function renderFailure(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'stderr' in error) {
    const stderr = String((error as { stderr?: unknown }).stderr ?? '').trim();
    if (stderr.length > 0) return stderr.slice(-2000);
  }
  return message(error);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The Lambda entry point: Build's synchronous RequestResponse invoke
 * (ADR weather-to-site-bridge, decision step 1) delivers exactly
 * { build_id, bundle_key }. */
export const handler = async (event: PublishInvocation): Promise<{ readonly statusCode: number }> => runPublish(event);
