// The two addresses the share surface needs, both pure and both derived from
// values handed in:
//
//   1. the `{url}?b={build_id}` line that closes the section-10 template, and
//   2. the number-less `wa.me/?text=` carrier that opens WhatsApp with that
//      message already written (application-architecture.md §13).
//
// No hostname is written here. The origin arrives as `configuredSite`, which
// the components read from Astro's configured `site` and pass down, so
// registering a real domain stays one edit in astro.config.mjs and never a
// change under src/share. No clock either: the build stamp derives from the
// published morning's own `published_at`.

/**
 * The P1 build stamp, `b_<YYYY-MM-DDTHH>Z`, read off the published morning's
 * `published_at` in UTC (src/pipeline/build.ts's header contract). The
 * published surface carries no `build_id` field, so `published_at` is the
 * source; an unreadable one throws here rather than stamping a paste with a
 * quietly invented date.
 */
function buildStamp(publishedAt: string): string {
  const utc = new Date(publishedAt).toISOString();
  return `b_${utc.slice(0, 10)}T${utc.slice(11, 13)}Z`;
}

/**
 * The closing line of the share message: the configured site's home, sealed
 * with the morning's build stamp so every paste is a fresh URL to WhatsApp's
 * preview crawler. The `?b=` cache-buster belongs to shared URLs only; the
 * page canonical strips it (§13).
 */
export function stampedShareLink(configuredSite: string, publishedAt: string): string {
  const shared = new URL('/', configuredSite);
  shared.searchParams.set('b', buildStamp(publishedAt));
  return shared.toString();
}

/**
 * The one-tap action's destination: WhatsApp's number-less carrier holding the
 * already-written call. No number is fixed, so the sender picks the chat
 * (§13). Plain anchor, so it works with page JavaScript off.
 */
export function whatsAppShareHref(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
