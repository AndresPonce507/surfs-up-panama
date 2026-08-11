# Paste 03-03: WhatsApp preview boundary and external verification

## Decision

The released product boundary is the public, publish-time handoff: the home
document publishes Spanish `og:title`, `og:description`, `og:url`, and
`og:locale=es_PA`; its canonical address is clean; and the share action sends
the same build-stamped absolute URL. This is the complete, controllable
contract for Paste 03-03.

WhatsApp's authenticated chat card is a third-party rendering outcome. It is
not an owned release gate and cannot turn a passing public handoff into an
`INDETERMINATE` product result solely because no authorized test chat is
available. This corrects the charter's card-rendering oracle without relaxing
any owned behaviour.

## Evidence

- `docs/product/architecture/application-architecture.md` §13 defines the
  public paste text and Open Graph metadata as the share surface.
- The same document §15 names WhatsApp preview behaviour as an unverified seam
  and says it does not block launch.
- `docs/feature/f-paste-the-call-into-the-group/feature-delta.md` slice-03
  limits the implementation to publish-time meta elements and no sharing
  service.
- On 2026-08-10, `PASTE_JIT=1 npm run test:at -- --tags
  '@feature-f-paste-the-call-into-the-group and @jit-03-03'` passed all five
  owned scenarios. `npm run build` also passed and emitted the four metadata
  fields and clean canonical address in `dist/index.html`.

## External verification prerequisite

This optional launch observation requires an authorized WhatsApp client and a
user-owned test chat, such as "Mensaje a ti mismo". It must never require a
credential to be recorded in the repository.

1. Publish the current build and open its public home page.
2. Copy the exact shared URL, including its `?b={build_id}` stamp.
3. In the authorized test chat, paste that URL and wait for WhatsApp's normal
   preview completion.
4. Compare the card's visible title and description with the public page's
   `og:title` and `og:description`. They must name the same spot and score in
   Spanish; the link must not render as a bare URL.
5. Append an **operational observation** of `PASS`, `FAIL`, or `NOT_EXECUTED`
   to the expectation charter's session log. It is never an acceptance-test
   result. `NOT_EXECUTED` means the authorized client or test chat was
   unavailable and makes no claim about the card. `FAIL` requires the public
   URL, build stamp, page metadata, observed card text, and capture time so the
   public handoff and the external renderer can be investigated separately.

## Acceptance mapping

The five `@jit-03-03` scenarios remain the release contract for this slice.
The expectation charter's direct chat-card observation is an external
verification prerequisite governed by this record, not a replacement for those
scenarios and not a new production responsibility.

## Independent review

`/root/signal_contract_repair` approved this correction on 2026-08-10. The
review confirmed that the OG image remains Paste slice-04 scope, and that the
five public scenarios and their built-output assertions remain unchanged.
