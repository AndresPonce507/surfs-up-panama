export type Fetcher = (path: string, request: RequestInit) => Promise<Response>;

export interface CredentialProvider {
  get(): Promise<string>;
  invalidate(): Promise<void>;
}

export interface CredentialStore {
  read(): Promise<{ readonly deviceId: string; readonly credential: string } | undefined>;
  write(identity: { readonly deviceId: string; readonly credential: string }): Promise<void>;
  clear(): Promise<void>;
}

/** Reloads reuse durable browser identity; only storage loss starts a new anonymous device. */
export function createCredentialProvider(
  fetcher: Fetcher = fetch,
  deviceId: string | undefined = undefined,
  identity: CredentialStore | undefined = undefined,
  mintEndpoint: string | undefined = undefined,
): CredentialProvider {
  let credential: Promise<string> | undefined;
  return {
    get: () => {
      credential ??= loadOrMintCredential(fetcher, deviceId, identity, mintEndpoint);
      return credential;
    },
    invalidate: async () => {
      credential = undefined;
      await identity?.clear();
    },
  };
}

async function loadOrMintCredential(
  fetcher: Fetcher,
  deviceId: string | undefined,
  identity: CredentialStore | undefined,
  mintEndpoint: string | undefined,
): Promise<string> {
  if (mintEndpoint === undefined) throw new Error('No hay un endpoint para preparar el envío del reporte.');
  const stored = await identity?.read();
  if (stored !== undefined) return stored.credential;
  const mintedDeviceId = deviceId ?? anonymousDeviceId();
  const credential = await mintCredential(fetcher, mintedDeviceId, mintEndpoint);
  await identity?.write({ deviceId: mintedDeviceId, credential });
  return credential;
}

async function mintCredential(fetcher: Fetcher, deviceId: string, endpoint: string): Promise<string> {
  const response = await fetcher(endpoint, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    body: JSON.stringify({ device_id: deviceId }),
  });
  const body = await response.json().catch(() => undefined) as { credential?: unknown } | undefined;
  if (!response.ok || typeof body?.credential !== 'string') {
    throw new Error('No pudimos preparar el envío del reporte ahora.');
  }
  return body.credential;
}

function anonymousDeviceId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `d_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
