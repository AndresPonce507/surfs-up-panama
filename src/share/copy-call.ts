/** Browser capability required to put a completed call on the clipboard. */
export type WriteClipboard = (call: string) => Promise<void>;

export const COPY_FAILURE_NOTICE = 'No se pudo copiar. Mándalo por WhatsApp.' as const;

export type CopyCallOutcome =
  | Readonly<{
      kind: 'copied';
      notice: 'Llamado copiado.';
    }>
  | Readonly<{
      kind: 'not-copied';
      notice: typeof COPY_FAILURE_NOTICE;
    }>;

const copiedOutcome: CopyCallOutcome = Object.freeze({
  kind: 'copied',
  notice: 'Llamado copiado.',
});

const notCopiedOutcome: CopyCallOutcome = Object.freeze({
  kind: 'not-copied',
  notice: COPY_FAILURE_NOTICE,
});

/**
 * Passes the already-composed call to the injected clipboard adapter. The
 * confirmation is available only after that adapter resolves successfully;
 * a rejected adapter becomes one honest, user-ready failure outcome.
 */
export async function copyCall(call: string, writeClipboard: WriteClipboard): Promise<CopyCallOutcome> {
  try {
    await writeClipboard(call);
    return copiedOutcome;
  } catch {
    return notCopiedOutcome;
  }
}
