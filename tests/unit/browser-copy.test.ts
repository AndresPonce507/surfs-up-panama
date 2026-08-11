import assert from 'node:assert/strict';

import { describe, it } from 'vitest';

import { writeClipboardWithFallback } from '../../src/share/browser-copy';

describe('writeClipboardWithFallback', () => {
  it('keeps a successful modern clipboard write successful when the legacy path would refuse', async () => {
    const events: string[] = [];

    await writeClipboardWithFallback(
      'Playa Venao está bueno.',
      async (text) => {
        events.push(`native:${text}`);
      },
      () => {
        events.push('legacy');
        throw new Error('legacy copy refused');
      },
    );

    assert.deepEqual(events, ['native:Playa Venao está bueno.']);
  });

  it('uses the legacy path when the modern clipboard write rejects', async () => {
    const events: string[] = [];

    await writeClipboardWithFallback(
      'El llamado completo',
      async () => {
        events.push('native');
        throw new Error('clipboard permission denied');
      },
      (text) => {
        events.push(`legacy:${text}`);
      },
    );

    assert.deepEqual(events, ['native', 'legacy:El llamado completo']);
  });

  it('uses the legacy path when the modern Clipboard API is unavailable', async () => {
    const written: string[] = [];

    await writeClipboardWithFallback('Llamado', undefined, (text) => {
      written.push(text);
    });

    assert.deepEqual(written, ['Llamado']);
  });

  it('rejects when neither clipboard path can copy', async () => {
    await assert.rejects(
      writeClipboardWithFallback(
        'Llamado',
        async () => {
          throw new Error('modern denied');
        },
        () => {
          throw new Error('legacy denied');
        },
      ),
      /legacy denied/,
    );
  });
});
