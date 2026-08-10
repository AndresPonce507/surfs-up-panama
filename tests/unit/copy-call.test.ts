// The copy workflow has one behavior at this step: hand the completed call to
// the clipboard port unchanged, then report the immutable success outcome.
// This is a pure-port property: the injected writer records an attempted
// browser effect without involving the browser API itself.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import { copyCall } from '../../src/share/copy-call';

describe('copyCall', () => {
  it('Property: every completed call reaches the clipboard port verbatim before the Spanish success outcome', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), async (call) => {
        const written: string[] = [];
        const outcome = await copyCall(call, async (candidate) => {
          written.push(candidate);
        });

        assert.deepEqual(
          { written, outcome },
          {
            written: [call],
            outcome: { kind: 'copied', notice: 'Llamado copiado.' },
          },
          'la acción debe copiar el llamado completo antes de confirmar que ya quedó listo',
        );
        assert.ok(Object.isFrozen(outcome), 'el resultado del núcleo debe ser inmutable');
      }),
      { numRuns: 100 },
    );
  });
});
