import type { Fetcher } from './mint';

export interface WriteBrowserEndpoints {
  readonly mint: string;
  readonly report: string;
}

/** Public endpoint discovery. The config contains Function URLs, never a secret. */
export async function loadWriteBrowserEndpoints(fetcher: Fetcher = fetch): Promise<WriteBrowserEndpoints | undefined> {
  try {
    const response = await fetcher('/push-config.json', { cache: 'no-store' });
    const body = await response.json().catch(() => undefined) as { mint_url?: unknown; report_url?: unknown } | undefined;
    const mint = configuredWriteEndpoint(body?.mint_url);
    const report = configuredWriteEndpoint(body?.report_url);
    return response.ok && mint !== undefined && report !== undefined ? { mint, report } : undefined;
  } catch {
    return undefined;
  }
}

export function configuredWriteEndpoint(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const endpoint = new URL(value);
    return endpoint.protocol === 'https:' || endpoint.protocol === 'http:' ? endpoint.href : undefined;
  } catch {
    return undefined;
  }
}
