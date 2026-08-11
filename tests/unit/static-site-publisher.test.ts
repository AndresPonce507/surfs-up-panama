import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { AstroStaticRouteRenderer, S3StaticSitePublisher, type GeneratedStaticFile } from '../../src/pipeline/adapters/static-site-publisher';
import type { StaticSurface } from '../../src/publish/static-surface';

const surface = {
  schema: 'published-surface-update/v1' as const,
  surf_date: '2026-08-10',
  published_at: '2026-08-10T11:22:00.000Z',
  build_kind: 'dawn' as const,
  calls: [{ spot_id: 'playa-venao', score_q: 80, call_es: 'Buena.' }],
  days: [
    { date: '2026-08-10', spots: [{ spot_id: 'playa-venao', score_q: 80, call_es: 'Buena.' }] },
    { date: '2026-08-11', spots: [{ spot_id: 'playa-venao', score_q: 60, call_es: 'Regular.' }] },
  ] as const,
};

function fakeClient() {
  const commands: Array<{ readonly name: string; readonly input: Record<string, unknown> }> = [];
  return {
    commands,
    send: async (command: unknown): Promise<unknown> => {
      const typed = command as { constructor: { name: string }; input: Record<string, unknown> };
      commands.push({ name: typed.constructor.name, input: typed.input });
      if (typed instanceof GetObjectCommand) {
        const error = new Error('missing') as Error & { name: string };
        error.name = 'NoSuchKey';
        throw error;
      }
      if (typed instanceof PutObjectCommand) return {};
      throw new Error(`unexpected ${typed.constructor.name}`);
    },
  };
}

describe('S3StaticSitePublisher', () => {
  it('runs the real Astro renderer against a writable surface and returns the complete static route set', async () => {
    const committed = JSON.parse(await readFile(resolve('data/published-surface.json'), 'utf8')) as StaticSurface;
    const files = await new AstroStaticRouteRenderer(process.cwd()).render(committed);
    expect(files.some((file) => file.path === 'index.html')).toBe(true);
    expect(files.some((file) => file.path === 'spots/playa-venao.html')).toBe(true);
    // This zero-JS surface currently emits no hashed bundle, but public
    // static assets still travel with the route set.
    expect(files.some((file) => file.path === 'favicon.svg')).toBe(true);
  }, 30_000);

  it('uploads complete HTML, immutable assets and directory aliases before the public probe', async () => {
    const client = fakeClient();
    const generated: readonly GeneratedStaticFile[] = [
      { path: 'assets/app.css', body: new Uint8Array([1]), contentType: 'text/css' },
      { path: 'index.html', body: new Uint8Array([2]), contentType: 'text/html' },
      { path: 'spots/playa-venao.html', body: new Uint8Array([3]), contentType: 'text/html' },
    ];
    const probes: string[] = [];
    const publisher = new S3StaticSitePublisher(client, 'bucket', { render: async () => generated }, { probe: async (buildId) => { probes.push(buildId); } });

    await publisher.publish({ build_id: 'b_2026-08-10T11Z', surface });
    await publisher.probe('b_2026-08-10T11Z');

    expect(client.commands.filter((command) => command.name === 'PutObjectCommand').map((command) => command.input.Key)).toEqual([
      'assets/app.css', 'site/index.html', 'site/spots/playa-venao.html', 'site/spots/playa-venao/', 'v1/static-surface.json',
    ]);
    expect(client.commands[1]?.input.CacheControl).toBe('public, max-age=31536000, immutable');
    expect(probes).toEqual(['b_2026-08-10T11Z']);
  });

  it('refuses an empty/non-HTML renderer output before anything is made public', async () => {
    const client = fakeClient();
    const publisher = new S3StaticSitePublisher(client, 'bucket', { render: async () => [{ path: 'assets/app.css', body: new Uint8Array(), contentType: 'text/css' }] }, { probe: async () => {} });
    await expect(publisher.publish({ build_id: 'b_1', surface })).rejects.toThrow('no HTML route');
    expect(client.commands.filter((command) => command.name === 'PutObjectCommand')).toEqual([]);
  });
});
