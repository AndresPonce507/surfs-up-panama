export type NativeClipboardWrite = (text: string) => Promise<void>;
export type LegacyClipboardWrite = (text: string) => void;

/**
 * Prefer the asynchronous Clipboard API. The legacy selection path is only a
 * fallback when that API is unavailable or rejects the write.
 */
export async function writeClipboardWithFallback(
  text: string,
  nativeWrite: NativeClipboardWrite | undefined,
  legacyWrite: LegacyClipboardWrite,
): Promise<void> {
  if (nativeWrite !== undefined) {
    try {
      await nativeWrite(text);
      return;
    } catch {
      // Older browsers and denied permissions still get the direct fallback.
    }
  }

  legacyWrite(text);
}
