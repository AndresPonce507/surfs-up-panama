/** Browser capability required to put a completed call on the clipboard. */
export type WriteClipboard = (call: string) => Promise<void>;

export type CopyCallOutcome = Readonly<{
  kind: 'copied';
  notice: 'Llamado copiado.';
}>;

const copiedOutcome: CopyCallOutcome = Object.freeze({
  kind: 'copied',
  notice: 'Llamado copiado.',
});

/**
 * Passes the already-composed call to the injected clipboard adapter. The
 * confirmation is available only after that adapter resolves successfully.
 */
export async function copyCall(call: string, writeClipboard: WriteClipboard): Promise<CopyCallOutcome> {
  await writeClipboard(call);
  return copiedOutcome;
}
