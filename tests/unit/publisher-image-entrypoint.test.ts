import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const dockerfile = readFileSync(
  resolve(process.cwd(), 'infra/lambda-images/publisher/Dockerfile'),
  'utf8',
);

describe('Publisher Lambda image entrypoint', () => {
  it('uses a handler module name that the Lambda Node runtime can resolve', () => {
    const command = dockerfile.match(/^CMD \["([^"]+)"\]$/m)?.[1];

    expect(command).toBe('publish-handler-bootstrap.handler');

    const [moduleName, exportName, unexpected] = command?.split('.') ?? [];
    expect(unexpected).toBeUndefined();
    expect(moduleName).toBe('publish-handler-bootstrap');
    expect(exportName).toBe('handler');
    expect(dockerfile).toContain('> /var/task/publish-handler-bootstrap.mjs');
  });

  it('keeps Astro telemetry configuration in Lambda writable storage', () => {
    expect(dockerfile).toContain('ENV XDG_CONFIG_HOME=/tmp/.config');
    expect(dockerfile).toContain('ASTRO_TELEMETRY_DISABLED=1');
  });
});
