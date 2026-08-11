import { describe, expect, it } from 'vitest';

import { historyProbeFinding } from '../../scripts/check-published-call-history-probe.mjs';

describe('production build composition history probe structure', () => {
  it('accepts wire -> awaited probe -> use and rejects an unprobed use', () => {
    expect(historyProbeFinding('async function runProductionBuild() { const probe = await store.probePublishedCallHistory(scope); if (!probe.ok) throw new Error(); await runBuildOnce({ store }); }')).toBeNull();
    expect(historyProbeFinding('async function runProductionBuild() { /* await store.probePublishedCallHistory(scope) */ await runBuildOnce({ store }); }')).toMatch(/missing awaited probe/);
    expect(historyProbeFinding('async function runProductionBuild() { const probe = await otherStore.probePublishedCallHistory(scope); if (!probe.ok) throw new Error(); await runBuildOnce({ store }); }')).toMatch(/missing awaited probe/);
  });
});
