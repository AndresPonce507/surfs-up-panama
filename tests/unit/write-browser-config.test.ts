import assert from 'node:assert/strict';

import { describe, it } from 'vitest';

import { loadWriteBrowserEndpoints } from '../../src/report/write-browser-config';

describe('public Write browser configuration', () => {
  it('accepts only a complete public mint and report endpoint pair', async () => {
    const endpoints = await loadWriteBrowserEndpoints(async () => Response.json({
      mint_url: 'https://mint.lambda.example/', report_url: 'https://report.lambda.example/',
    }));
    assert.deepEqual(endpoints, { mint: 'https://mint.lambda.example/', report: 'https://report.lambda.example/' });

    const incomplete = await loadWriteBrowserEndpoints(async () => Response.json({ mint_url: 'https://mint.lambda.example/' }));
    assert.equal(incomplete, undefined, 'a fallback must never invent a same-origin write path when report_url is absent');
  });
});
