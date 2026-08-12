// The production reading surface, built and served the way it actually ships.
//
// WHY NOT `astro preview` OR `vite preview`
// -----------------------------------------
// Both resolve routes with a dev server's generosity. `vite preview` in
// particular falls back to index.html for any unmatched path, which turns a
// page that does not exist into a 200 and quietly converts a missing surface
// into a passing test. This feature's whole point is that a missing thing must
// read as missing, so the emitted `dist/` is served by a plain static file
// server with no fallback: a path that resolves to no emitted file returns the
// real 404 document with a real 404 status.
//
// Route resolution mirrors `astro.config.mjs` build.format:'file'. The spot page
// is emitted as `dist/spots/playa-venao.html` while `dist/spots/playa-venao/`
// also exists as a real directory holding ayer/reportar/reportado. So the
// sibling `.html` is tried BEFORE the directory index, or the one page these
// scenarios need most would 404 against its own directory.
//
// WHY THE BUILD RUNS IN AN ISOLATED PROJECT ROOT
// ----------------------------------------------
// `scripts/ci-local-core.mjs` says it outright: two concurrent `astro build`
// runs collide on the shared `.astro` / `.prerender` / `.vite` scratch
// directories, "whatever --outDir each was given", which is why the `budget`
// job is marked serial and gets its own wave. The `at` and `ui` jobs share
// wave 1, and `ui` already builds. So an acceptance run that built in the
// repository root would introduce exactly the collision that comment warns
// about. The project is therefore copied into a temporary root the way the
// keystone's slice-06 steps already do it, with a directory junction to the
// installed `node_modules` so nothing is downloaded and the dependency tree is
// the real one. The scratch directories then live inside that private root and
// cannot collide with anything.
//
// The copy and the build run once per process, not once per scenario: every
// scenario here reads the unmodified real surface, so there is nothing to
// isolate between them and a rebuild each time would only buy wall clock.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
} from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize, sep } from 'node:path';

const projectRoot = process.cwd();

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
};

let builtDist: string | null = null;
let isolatedRoot: string | null = null;

/** A private copy of the project, wired to the already-installed dependencies. */
function copyProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'surfs-up-avisos-'));
  for (const name of ['astro.config.mjs', 'package.json', 'package-lock.json', 'tsconfig.json']) {
    copyFileSync(join(projectRoot, name), join(root, name));
  }
  for (const name of ['data', 'public', 'scripts', 'src']) {
    cpSync(join(projectRoot, name), join(root, name), { recursive: true });
  }
  symlinkSync(join(projectRoot, 'node_modules'), join(root, 'node_modules'), 'dir');
  return root;
}

/** Run the real production build once, and hand back the emitted directory. */
export function ensureBuiltSurface(): string {
  if (builtDist !== null) return builtDist;
  const root = copyProjectRoot();
  isolatedRoot = root;
  const result = spawnSync('npm', ['run', 'build'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 300_000,
  });
  assert.equal(
    result.status,
    0,
    `la construcción real de la superficie falló antes de poder observar nada:\n${(result.stderr ?? '') + (result.stdout ?? '')}`,
  );
  const dist = join(root, 'dist');
  assert.ok(existsSync(join(dist, 'index.html')), `la construcción no dejó documentos en ${dist}`);
  builtDist = dist;
  return dist;
}

process.once('exit', () => {
  if (isolatedRoot !== null) rmSync(isolatedRoot, { recursive: true, force: true });
});

export type StaticSurface = {
  readonly origin: string;
  readonly dist: string;
  close(): Promise<void>;
};

/** Serve the emitted directory over real HTTP, with no route fallback. */
export async function serveBuiltSurface(): Promise<StaticSurface> {
  const dist = ensureBuiltSurface();
  const notFoundBody = existsSync(join(dist, '404.html'))
    ? readFileSync(join(dist, '404.html'))
    : Buffer.from('<!doctype html><title>404</title>', 'utf8');

  const server: Server = createServer((request, response) => {
    const pathname = decodeURIComponent((request.url ?? '/').split('?')[0]!.split('#')[0]!);
    const file = resolveEmittedFile(dist, pathname);
    if (file === null) {
      response.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
      response.end(notFoundBody);
      return;
    }
    response.writeHead(200, {
      'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
    });
    createReadStream(file).pipe(response);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    dist,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

function resolveEmittedFile(dist: string, pathname: string): string | null {
  const relative = normalize(pathname).replace(/^[/\\]+/, '');
  if (relative.split(/[/\\]/).includes('..')) return null;
  const base = relative === '' || relative.endsWith(sep) ? relative : relative;
  const trimmed = base.replace(/[/\\]+$/, '');
  const candidates =
    trimmed === ''
      ? ['index.html']
      : [trimmed, `${trimmed}.html`, join(trimmed, 'index.html')];
  for (const candidate of candidates) {
    const absolute = join(dist, candidate);
    if (!absolute.startsWith(dist)) continue;
    if (existsSync(absolute) && statSync(absolute).isFile()) return absolute;
  }
  return null;
}

/** The one spot every slice-01 scenario is written about. */
export const VENAO_PATH = '/spots/playa-venao';
