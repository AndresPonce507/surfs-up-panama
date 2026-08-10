// Verified push-service destination allowlist (07-write-path.md §8.4,
// Pre-requisite 7). This is the ONLY module holding host data for the
// endpoint-allowlist reject: decideSubscribe never hardcodes a host, it only
// matches whatever `allowlist` it is handed (07-write-path.md §10). The
// list is DATA passed INTO decideSubscribe, never read ambiently, which is
// why the acceptance suite can keep supplying its own three-host fixture
// (steps/push-server.steps.ts) instead of importing this module.
//
// MATCHING RULE -- fail closed, no naive substring test
// -------------------------------------------------------------------------
// - A plain entry ("fcm.googleapis.com") matches only that exact host, as
//   returned by the URL parser (which already ASCII-lowercases the host) --
//   nothing else. A trailing-dot FQDN of the same host does NOT match: it
//   is a different string, and this module does not decide it is "probably
//   the same host". A host it cannot classify is rejected, same as any
//   other unrecognised host (DESIGN_CONTEXT: fail closed).
// - A leading-dot entry (".notify.windows.com") matches the bare suffix OR
//   a host ending in "." + that suffix -- a real DNS label boundary, never
//   `host.endsWith(suffix)` on its own, which is the classic bypass
//   ("evil-notify.windows.com" must NOT match ".notify.windows.com").
//
// Each hostname below is checked against the vendor's current
// documentation at authoring time (2026-08-10); source and confidence
// recorded next to it, never written from memory. Pre-requisite 7 accepts
// an incomplete list as a known, self-reporting gap PRECISELY BECAUSE the
// reject this list feeds is loud and names the host it refused
// (decide-subscribe.ts).
//
// FCM is the only one of the four with a single fixed host; Apple,
// Mozilla, and WNS all publish (or exhibit) a *variable* subdomain, so
// those three ship as domain-suffix entries, not exact hosts -- an exact
// list here would be exactly the "wrong list silently locks a real browser
// out of subscribing" failure mode this step's design brief warns against.
//
// KNOWN GAPS, left open rather than guessed (self-reported by the loud
// reject, not silently patched over):
//   - legacy pre-2018 Chrome subscriptions can carry
//     `android.googleapis.com/gcm/send/...`; current FCM is
//     `fcm.googleapis.com` only. Whether to also allowlist the legacy host
//     is a product decision, not made here.
//   - Mozilla has no single official page stating the production endpoint
//     host (autopush-rs HTTP docs plus third-party observations only), so
//     `mozaws.net` (broad AWS-hosted space, unverified provenance) is
//     deliberately NOT included.

export const PUSH_SERVICE_ALLOWLIST: readonly string[] = [
  // Firebase Cloud Messaging (FCM) web push -- Chrome, Edge (Chromium),
  // Android WebView/Edge. Single fixed host. Confidence: high.
  // Source: Chrome for Developers, "Web Push Interop Wins" (developer.chrome.com).
  'fcm.googleapis.com',
  // Apple web push -- Safari on macOS 13+ / iOS 16.4+, desktop and mobile.
  // WebKit's own announcement states the allowed origin as a wildcard,
  // "*.push.apple.com"; the one host actually observed in the wild is
  // web.push.apple.com. Confidence: medium-high.
  // Source: WebKit.org, "Web Push for Web Apps on iOS and iPadOS".
  '.push.apple.com',
  // Mozilla autopush -- Firefox desktop and Android. No single official
  // page names the production host; autopush-rs's own HTTP docs plus
  // repeated third-party observations (2017-2023) agree on the
  // updates.push.services.mozilla.com host under this suffix. Confidence:
  // medium (documented gap, see KNOWN GAPS above).
  // Source: mozilla-services.github.io/autopush-rs HTTP API docs.
  '.push.services.mozilla.com',
  // Windows Notification Service (WNS) -- desktop Windows Edge only
  // (Android Edge uses FCM instead). Microsoft's own docs state the
  // channel URI subdomain "is subject to change", i.e. genuinely variable,
  // not a fixed set worth enumerating. Confidence: high.
  // Source: Microsoft Learn, WNS overview + ForceBuiltInPushMessagingClient
  // policy page (both current).
  '.notify.windows.com',
];

/**
 * True when `host` is exactly an allowlist entry, or -- for a domain-suffix
 * entry (leading ".") -- sits on a real label boundary under it. Never a
 * substring/`endsWith`-without-boundary test: neither
 * "fcm.googleapis.com.attacker.tld" nor "evil.fcm.googleapis.com" may pass
 * against the plain "fcm.googleapis.com" entry above.
 */
export function isAllowedHost(host: string, allowlist: readonly string[]): boolean {
  return allowlist.some((entry) => matchesEntry(host, entry));
}

function matchesEntry(host: string, entry: string): boolean {
  if (entry.startsWith('.')) {
    const suffix = entry.slice(1);
    return host === suffix || host.endsWith(`.${suffix}`);
  }
  return host === entry;
}
