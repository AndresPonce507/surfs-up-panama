// The report island: the one script the reportar document loads
// (application-architecture.md section 6 budgets it, 01-09 asserts the
// budget). It activates the static, disabled form, and owns the tap order
// application-architecture.md section 8 leak path L3 pins: durable commit
// FIRST, then the page mints or reuses its anonymous credential, POSTs the
// exact durable bytes, receives its matching receipt, then changes address
// and renders arrival. It never reaches src/data/forecast or a reveal GET.
//
// PARADIGM EXEMPTION (this step's implementation notes, ADR-025 legacy
// 5-phase contract): DOM orchestration wiring is single-shot by nature and is
// exempt from the pipeline-composition/property-testing default. What IS
// extracted below as pure decision functions -- decideProbeUi, decideCommitUi,
// parseAnswers -- are genuine ports (plain data in, plain data out) and are
// unit tested example-based in tests/unit/report-island.test.ts: each is a
// two- or three-branch map with no invariant a property would explore beyond
// the branches themselves, so examples covering every branch are the honest
// test, not a property dressed up as one. The commit and probe LAWS this
// island composes with already carry their properties, on the record
// (report-record.ts, 01-01) and on the queue (queue.ts, 01-02).
//
// This module must never import from src/data/forecast, src/publish/** or
// src/pipeline/**, for the same leak-isolation reason report-record.ts and
// queue.ts must not (leak path L1). It reads src/i18n/routes and the Locale
// type from src/i18n/strings; both are read-only imports of another lane's
// files, per this step's implementation notes.

import { composeReportRecord, type ReportAnswers } from './report-record';
import { createCredentialProvider, type CredentialProvider } from './mint';
import { finalizeSavedReport, sendWithCredentialRecovery, type ReportReceipt, type SubmissionOutcome } from './submit';
import { decideArrivalUi, type ComparisonLines } from './reveal';
import {
  SENTINEL_KEY_PREFIX,
  openReportQueue,
  type CommitOutcome,
  type QueueOutcome,
  type QueueStore,
  type ReportQueue,
} from './queue';
import { QUALITY_TOKENS, WIND_STATE_TOKENS } from '../data/report-vocab';
import { sizeBands } from '../data/size-bands';
import { paths } from '../i18n/routes';
import { strings, type Locale } from '../i18n/strings';

// ---------------------------------------------------------------------------
// Copy. The queued confirmation is settled and verbatim (see the grep-able
// source below); the storage-refused notice is behavioural only (this step's
// implementation notes, feature-delta Pre-requisite 8a: the exact Spanish is
// pending sign-off). Both live here rather than src/report/copy.ts because
// this step's files_to_modify does not include a new file; FLAGGED for a
// future step to consolidate into src/report/copy.ts as the implementation
// notes originally suggested.
// ---------------------------------------------------------------------------

/** application-architecture.md section 10, the queued (offline) variant, verbatim. */
export const QUEUED_CONFIRMATION_MESSAGE =
  'Guardado. Cuando vuelva la señal lo mandamos y te decimos cómo nos fue.';

/** Plain Spanish, no technical vocabulary. Wording itself is not yet settled copy. */
export const STORAGE_REFUSED_MESSAGE =
  'No podemos guardar tu reporte en este teléfono ahora mismo.';

/**
 * Cold load of the confirmation address with nothing durably stored for this
 * spot on this device (never reported here, storage was cleared, or a stale
 * bookmark). A real state, same status as STORAGE_REFUSED_MESSAGE: plain
 * Spanish, no error vocabulary, and never a false "Guardado" -- OPEN COPY
 * ITEM, flag for the same product sign-off pass as Pre-requisite 8a.
 */
export const NOTHING_QUEUED_MESSAGE =
  'Por ahora no tenemos un reporte guardado en este teléfono para este spot.';

/**
 * Headings for the two "confirmación guardada" screens -- the live tap-
 * through (applyCommitUi) and a cold load of /reportado/ (mountReportReveal)
 * are the same truth and must read identically (this step's second-round
 * finding: both states shipped as a single unclassed <p>, no heading, no
 * card, no way back -- reads as unfinished at the exact moment the flow is
 * supposed to feel done). OPEN COPY ITEM, same sign-off pass as
 * Pre-requisite 8a/8b: wording only, not yet settled.
 */
export const CONFIRMED_HEADING = 'Reporte guardado';
export const NOTHING_QUEUED_HEADING = 'Sin reporte guardado';
export const SEND_REFUSED_MESSAGE = 'No pudimos enviar el reporte ahora.';

// The arrived-state copy moved to src/report/reveal.ts in step 04-01, which
// is the "consolidate into a copy module" boundary the note above was waiting
// for. It lives beside the comparison it now shares a decision with.

// ---------------------------------------------------------------------------
// Pure decision ports. Plain data in, plain data out -- no DOM, no storage.
// ---------------------------------------------------------------------------

/**
 * The one way forward or back a confirmed/not_found screen offers. `emphasis`
 * carries the design intent, not styling detail: 'quiet' is a way back once
 * something is already settled (a prominent "report again" would be wrong,
 * they just did); 'primary' is a way forward when nothing is stored yet and
 * a path into reporting is the only useful next step. The render layer maps
 * 'quiet' to the existing hairline `nav` pattern (SpotDetail.astro's "Volver
 * a la lista") and 'primary' to the existing `.cta` pattern (the same green
 * button both the spot page and the reportar Mandar button already use) --
 * no new CSS, both selectors already ship via Base.astro.
 */
export interface RevealNav {
  readonly href: string;
  readonly label: string;
  readonly emphasis: 'quiet' | 'primary';
}

/**
 * What a confirmed, arrived or not_found screen shows, regardless of which
 * entry point rendered it. `comparison` is present only when the receipt
 * carried a whole one (src/report/reveal.ts decides that, never this layer).
 */
export interface RevealPresentation {
  readonly heading: string;
  readonly message: string;
  readonly nav: RevealNav;
  readonly comparison?: ComparisonLines;
}

export type ProbeUiDecision = { readonly kind: 'ready' } | { readonly kind: 'notice'; readonly message: string };

/** Mandar may only ever be enabled by a passing probe (this step's criterion 1). */
export function decideProbeUi(outcome: QueueOutcome): ProbeUiDecision {
  if (outcome.kind === 'refused') return { kind: 'notice', message: STORAGE_REFUSED_MESSAGE };
  return { kind: 'ready' };
}

export interface ConfirmationLinks {
  /** The reportado address, swapped in with history.replaceState before anything renders. */
  readonly historyUrl: string;
  /** The one way back the confirmation offers: the spot page, never the form. */
  readonly backHref: string;
  readonly backLabel: string;
}

export type CommitUiDecision =
  | (RevealPresentation & { readonly kind: 'confirmed'; readonly historyUrl: string })
  | { readonly kind: 'notice'; readonly message: string };

/**
 * What the screen does once a commit attempt resolves. A refusal here (a
 * probe that passed and a store that still fails mid-session) must never
 * swap the address or claim the label was saved -- the same plain notice a
 * refused probe would have shown. A successful commit is always the "quiet
 * way back" nav (this step's WHAT TO BUILD: calm and final, never a
 * prominent "report again" -- they just did).
 */
export function decideCommitUi(outcome: CommitOutcome, links: ConfirmationLinks): CommitUiDecision {
  if (outcome.kind === 'refused') return { kind: 'notice', message: STORAGE_REFUSED_MESSAGE };
  return {
    kind: 'confirmed',
    heading: CONFIRMED_HEADING,
    message: QUEUED_CONFIRMATION_MESSAGE,
    nav: { href: links.backHref, label: links.backLabel, emphasis: 'quiet' },
    historyUrl: links.historyUrl,
  };
}

const SIZE_BAND_TOKENS = new Set<string>(sizeBands.map((band) => band.value));
const WIND_TOKENS = new Set<string>(WIND_STATE_TOKENS);
const QUALITY_TOKEN_SET = new Set<string>(QUALITY_TOKENS);

export interface RawAnswers {
  readonly size_band: string | null;
  readonly wind: string | null;
  readonly quality: string | null;
}

/**
 * Reads the three radio values as the one shared vocabulary or not at all.
 * Defensive rather than decorative: domain-model.md section 10 gives a
 * committed record no edit command, so a tampered or missing value must never
 * reach composeReportRecord as a fourth kind of placeholder token.
 */
export function parseAnswers(raw: RawAnswers): ReportAnswers | undefined {
  const { size_band, wind, quality } = raw;
  if (size_band === null || !SIZE_BAND_TOKENS.has(size_band)) return undefined;
  if (wind === null || !WIND_TOKENS.has(wind)) return undefined;
  if (quality === null || !QUALITY_TOKEN_SET.has(quality)) return undefined;
  return {
    size_band: size_band as ReportAnswers['size_band'],
    wind: wind as ReportAnswers['wind'],
    quality: quality as ReportAnswers['quality'],
  };
}

// ---------------------------------------------------------------------------
// The IndexedDB adapter. Satisfies queue.ts's string-keyed QueueStore port,
// but stores report rows as structured objects rather than opaque JSON
// strings: the acceptance journey's queuedReports() dump (tests/acceptance/.../
// support/world.ts) reads real IndexedDB with a plain indexedDB.getAll() and
// expects a row with a report_id field, not a string that happens to parse
// into one. Discriminating on SENTINEL_KEY_PREFIX (queue.ts's own exported
// convention) rather than sniffing the value keeps this deterministic: a
// sentinel token is never JSON, a report row always is. The round trip
// (store parsed, read back stringified) reproduces encodeRow's bytes exactly,
// because JSON.parse then JSON.stringify preserves key order and every field
// here is a plain ASCII string, a small integer or an array of strings.
// ---------------------------------------------------------------------------

const DATABASE_NAME = 'psb-report-queue';
const STORE_NAME = 'entries';
const LOCAL_CREDENTIAL_KEY = 'psb-report-credential';

function openIndexedDbStore(): Promise<QueueStore> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(storeFrom(request.result));
    request.onerror = () => reject(request.error ?? new Error('report queue: indexedDB open failed'));
  });
}

function storeFrom(db: IDBDatabase): QueueStore {
  return {
    put: (key, value) =>
      runRequest(db, 'readwrite', (store) => store.put(toStorable(key, value), key)).then(() => undefined),
    get: (key) => runRequest(db, 'readonly', (store) => store.get(key)).then(fromStorable),
    remove: (key) => runRequest(db, 'readwrite', (store) => store.delete(key)).then(() => undefined),
    entries: () => listStoredEntries(db),
  };
}

function listStoredEntries(db: IDBDatabase): Promise<readonly { readonly key: string; readonly value: string }[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const keys = store.getAllKeys();
    const values = store.getAll();
    transaction.oncomplete = () => resolve(
      keys.result.flatMap((key, index) => {
        const value = fromStorable(values.result[index]);
        return typeof key === 'string' && value !== undefined ? [{ key, value }] : [];
      }),
    );
    transaction.onerror = () => reject(transaction.error ?? new Error('report queue: indexedDB list failed'));
  });
}

function runRequest(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = action(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result as unknown);
    request.onerror = () => reject(request.error ?? new Error('report queue: indexedDB request failed'));
  });
}

function toStorable(key: string, value: string): unknown {
  return key.startsWith(SENTINEL_KEY_PREFIX) ? value : (JSON.parse(value) as unknown);
}

function fromStorable(stored: unknown): string | undefined {
  if (stored === undefined) return undefined;
  return typeof stored === 'string' ? stored : JSON.stringify(stored);
}

function randomSentinelToken(): string {
  return `probe-${crypto.randomUUID()}`;
}

// ---------------------------------------------------------------------------
// DOM wiring. Imperative and single-shot by design (paradigm exemption
// above); not unit tested directly, exercised by the real-browser acceptance
// journey.
// ---------------------------------------------------------------------------

interface IslandElements {
  readonly form: HTMLFormElement;
  readonly button: HTMLButtonElement;
  readonly notice: HTMLElement;
  readonly confirmation: HTMLElement;
  /** The screen-1 question heading ("¿Cómo estuvo {spot}?"). Optional: its
   * absence must never block activation, only the tidy-up of removing it once
   * the confirmed heading (CONFIRMED_HEADING) replaces it -- a document should
   * carry one heading, not the question and the answer stacked. */
  readonly heading: HTMLElement | null;
}

function findElements(doc: Document): IslandElements | undefined {
  const form = doc.querySelector<HTMLFormElement>('form[data-report-form]');
  const button = form?.querySelector<HTMLButtonElement>('button[type="submit"]') ?? null;
  const notice = doc.querySelector<HTMLElement>('[data-storage-notice]');
  const confirmation = doc.querySelector<HTMLElement>('[data-report-confirmation]');
  const heading = doc.querySelector<HTMLElement>('[data-report-heading]');
  if (!form || !button || !notice || !confirmation) return undefined;
  return { form, button, notice, confirmation, heading };
}

function showNotice(notice: HTMLElement, message: string): void {
  notice.textContent = message;
  notice.hidden = false;
}

function applyProbeUi(decision: ProbeUiDecision, elements: IslandElements): void {
  if (decision.kind === 'ready') {
    elements.form.dataset.storageReady = 'true';
    return;
  }
  showNotice(elements.notice, decision.message);
}

function applyCommitUi(decision: CommitUiDecision, elements: IslandElements): void {
  if (decision.kind === 'notice') {
    showNotice(elements.notice, decision.message);
    return;
  }
  // Tap order, application-architecture.md section 8 leak path L3: durable
  // commit already awaited by the caller, then the address swap, then the
  // render. Never any other order.
  history.replaceState(null, '', decision.historyUrl);
  elements.form.remove();
  // One heading per document: the question this screen asked is answered
  // now, so it goes with the form (this step's second-round finding).
  elements.heading?.remove();
  renderRevealView(elements.confirmation, decision);
}

/**
 * The arrived state. What it may say is decided entirely by the receipt the
 * server sent back plus the answers the surfer gave (src/report/reveal.ts);
 * this layer only renders the decision, so there is no path here that can
 * invent a comparison the response did not carry.
 */
function applyReceivedUi(
  receipt: ReportReceipt,
  observed: ReportAnswers | undefined,
  links: ConfirmationLinks,
  elements: IslandElements,
): void {
  history.replaceState(null, '', links.historyUrl);
  elements.form.remove();
  elements.heading?.remove();
  renderRevealView(elements.confirmation, {
    ...decideArrivalUi(receipt, observed),
    nav: { href: links.backHref, label: links.backLabel, emphasis: 'quiet' },
  });
}

/**
 * Renders a confirmed or not_found presentation -- shared by the live
 * tap-through (applyCommitUi, above) and a cold load of /reportado/
 * (mountReportReveal, below). Both are the same truth and must read
 * identically: heading, a quiet `section` card for the message (reusing the
 * spot page's existing day-card recipe, src/styles/components.css, no new
 * CSS), then the one way forward or back -- the hairline `nav` pattern for
 * 'quiet', the green `.cta` tray for 'primary'. No selector here is new; all
 * of them already ship via Base.astro's inlined tokens/base/components CSS.
 */
function renderRevealView(container: HTMLElement, presentation: RevealPresentation): void {
  const heading = document.createElement('h1');
  heading.textContent = presentation.heading;

  const card = document.createElement('section');
  card.append(paragraph(presentation.message), ...comparedLines(presentation.comparison));

  // The count sits under the card, not inside it (application-architecture.md
  // section 10's report screen 2 wireframe): the card is what we said against
  // what they saw, the count is about the spot.
  const countLine = presentation.comparison === undefined ? [] : [paragraph(presentation.comparison.count)];

  container.replaceChildren(heading, card, ...countLine, buildNavElement(presentation.nav));
  container.hidden = false;
}

function comparedLines(comparison: ComparisonLines | undefined): readonly HTMLElement[] {
  if (comparison === undefined) return [];
  return [paragraph(comparison.said), paragraph(comparison.saw), paragraph(comparison.difference)];
}

function paragraph(text: string): HTMLElement {
  const element = document.createElement('p');
  element.textContent = text;
  return element;
}

function buildNavElement(nav: RevealNav): HTMLElement {
  const link = document.createElement('a');
  link.href = nav.href;
  link.textContent = nav.label;
  if (nav.emphasis === 'primary') {
    link.className = 'cta';
    const tray = document.createElement('p');
    tray.append(link);
    return tray;
  }
  const wrapper = document.createElement('nav');
  wrapper.append(link);
  return wrapper;
}

export type RevealUiDecision =
  | ({ readonly kind: 'confirmed' } & RevealPresentation)
  | ({ readonly kind: 'not_found' } & RevealPresentation);

/** The two links a reveal decision needs: back into the spot once something
 * is confirmed, forward into reporting once nothing is. */
export interface RevealLinks {
  readonly backHref: string;
  readonly backLabel: string;
  readonly reportHref: string;
  readonly reportLabel: string;
}

/**
 * Cold-load truth for /reportado/, sourced only from what is durably on the
 * phone -- no server, no forecast, no assumption of a prior in-app
 * transition (event ddc0ba7c). A queued record exists for this spot: render
 * the same settled queued sentence and the same quiet way-back nav the live
 * tap order renders (this step's implementation notes -- slice-01 never
 * sends, so "queued" is the only honest state whether the load is live or
 * cold). Nothing exists: a real, plain state, never an error and never a
 * false "Guardado" -- and, unlike the confirmed state, a way FORWARD matters
 * here, so the nav is the primary CTA into reporting (this step's WHAT TO
 * BUILD, second-round finding).
 */
export function decideRevealUi(hasQueuedReport: boolean, links: RevealLinks): RevealUiDecision {
  if (hasQueuedReport) {
    return {
      kind: 'confirmed',
      heading: CONFIRMED_HEADING,
      message: QUEUED_CONFIRMATION_MESSAGE,
      nav: { href: links.backHref, label: links.backLabel, emphasis: 'quiet' },
    };
  }
  return {
    kind: 'not_found',
    heading: NOTHING_QUEUED_HEADING,
    message: NOTHING_QUEUED_MESSAGE,
    nav: { href: links.reportHref, label: links.reportLabel, emphasis: 'primary' },
  };
}

const REVEAL_PATH_PATTERN = /^\/(?:en\/)?spots\/([^/]+)\/report(?:ado|ed)\/?$/;

/**
 * Pulls the spot identity out of the reveal address itself. A cold load has
 * no prior-session dataset to read (ReportShell.astro's markup carries no
 * data-spot-id, and this step is not authorised to add one there), but the
 * URL already carries the identity -- paths.reported's own shape, read back.
 */
export function parseSpotIdFromRevealPath(pathname: string): string | undefined {
  return REVEAL_PATH_PATTERN.exec(pathname)?.[1];
}

/** Same address, the other half: 'en' under the /en/ tree, 'es' otherwise (i18n/routes.ts's own prefix convention). */
export function parseLocaleFromRevealPath(pathname: string): Locale {
  return pathname.startsWith('/en/') ? 'en' : 'es';
}

function readRawAnswers(form: HTMLFormElement): RawAnswers {
  const data = new FormData(form);
  return {
    size_band: data.get('size_band') as string | null,
    wind: data.get('wind') as string | null,
    quality: data.get('quality') as string | null,
  };
}

async function submitReport(
  queue: ReportQueue,
  credential: CredentialProvider | undefined,
  reportEndpoint: string | undefined,
  spotId: string,
  answers: ReportAnswers,
  links: ConfirmationLinks,
  elements: IslandElements,
): Promise<void> {
  const record = composeReportRecord(() => new Date(), Math.random, spotId, answers);
  const outcome = await queue.commit(record);
  if (outcome.kind === 'refused') {
    applyCommitUi(decideCommitUi(outcome, links), elements);
    return;
  }
  if (credential === undefined || reportEndpoint === undefined) {
    applyCommitUi(decideCommitUi(outcome, links), elements);
    return;
  }
  const savedBytes = await queue.savedRecord?.(outcome.report_id);
  if (savedBytes === undefined) {
    showNotice(elements.notice, STORAGE_REFUSED_MESSAGE);
    return;
  }
  try {
    const submission = await sendQueuedReport(queue, credential, reportEndpoint, outcome.report_id, savedBytes);
    if (submission.kind === 'refused') {
      showNotice(elements.notice, submission.message);
      return;
    }
    if (submission.receipt.report_id !== outcome.report_id) {
      showNotice(elements.notice, SEND_REFUSED_MESSAGE);
      return;
    }
    applyReceivedUi(submission.receipt, answers, links, elements);
  } catch {
    // A missing signal preserves the actual queue and its settled local confirmation.
    applyCommitUi(decideCommitUi(outcome, links), elements);
  }
}

async function sendQueuedReport(
  queue: ReportQueue,
  credential: CredentialProvider,
  reportEndpoint: string,
  reportId: string,
  savedBytes: string,
): Promise<SubmissionOutcome> {
  return finalizeSavedReport(
    reportId,
    await sendWithCredentialRecovery(savedBytes, credential, fetch, reportEndpoint),
    {
      discard: (candidateId) => queue.discardSavedRecord?.(candidateId) ?? Promise.reject(new Error('report queue cannot discard receipt')),
    },
  );
}

async function activate(elements: IslandElements, spotId: string, locale: Locale, spotName: string): Promise<void> {
  const opened = await openReportQueue({ openStore: openIndexedDbStore, newSentinel: randomSentinelToken });
  applyProbeUi(decideProbeUi(opened), elements);
  if (opened.kind !== 'ready') return;

  const links: ConfirmationLinks = {
    historyUrl: paths.reported(locale, spotId),
    backHref: paths.spot(locale, spotId),
    backLabel: spotName,
  };
  const endpoints = configuredWriteEndpoints(elements.form);
  const credential = endpoints === undefined
    ? undefined
    : createCredentialProvider(fetch, undefined, browserCredentialStore(opened.queue), endpoints.mint);

  // A passing storage probe makes reporting available, but Mandar is not an
  // honest action until all three answers exist. Keep the static disabled
  // state until the form carries one canonical value for every question.
  const syncSubmitAvailability = () => {
    elements.button.disabled = parseAnswers(readRawAnswers(elements.form)) === undefined;
  };
  elements.form.addEventListener('change', syncSubmitAvailability);
  syncSubmitAvailability();

  elements.form.addEventListener('submit', (event) => {
    event.preventDefault();
    const answers = parseAnswers(readRawAnswers(elements.form));
    if (!answers) return;
    void submitReport(opened.queue, credential, endpoints?.report, spotId, answers, links, elements).catch(() => {
      showNotice(elements.notice, STORAGE_REFUSED_MESSAGE);
    });
  });

  if (credential !== undefined && endpoints !== undefined) {
    void flushWaitingReport(opened.queue, credential, endpoints.report, spotId, links, elements).catch(() => {
      // A missing signal keeps the durable label and its settled local state.
    });
  }
}

async function flushWaitingReport(
  queue: ReportQueue,
  credential: CredentialProvider,
  reportEndpoint: string,
  spotId: string,
  links: ConfirmationLinks,
  elements: IslandElements,
): Promise<void> {
  const pending = await queue.pendingRecords?.() ?? [];
  const waiting = pending.find(({ bytes }) => {
    try {
      return (JSON.parse(bytes) as { spot_id?: unknown }).spot_id === spotId;
    } catch {
      return false;
    }
  });
  if (waiting === undefined) return;
  const submission = await sendQueuedReport(queue, credential, reportEndpoint, waiting.report_id, waiting.bytes);
  if (submission.kind === 'received' && submission.receipt.report_id === waiting.report_id) {
    applyReceivedUi(submission.receipt, savedAnswers(waiting.bytes), links, elements);
    return;
  }
  if (submission.kind === 'refused') showNotice(elements.notice, submission.message);
}

/**
 * The three answers read back off the durable record a waiting report was
 * stored as, so a report sent on the next page load can still show the "Tú
 * viste" half. Unreadable bytes yield undefined, which reveal.ts turns into
 * the plain arrival -- never half a comparison.
 */
function savedAnswers(bytes: string): ReportAnswers | undefined {
  try {
    const record = JSON.parse(bytes) as { size_band?: unknown; wind?: unknown; quality?: unknown };
    return parseAnswers({
      size_band: typeof record.size_band === 'string' ? record.size_band : null,
      wind: typeof record.wind === 'string' ? record.wind : null,
      quality: typeof record.quality === 'string' ? record.quality : null,
    });
  } catch {
    return undefined;
  }
}

function configuredWriteEndpoints(form: HTMLFormElement): { readonly mint: string; readonly report: string } | undefined {
  const mint = configuredWriteEndpoint(form.dataset.reportMintUrl);
  const report = configuredWriteEndpoint(form.dataset.reportSubmitUrl);
  return mint === undefined || report === undefined ? undefined : { mint, report };
}

function configuredWriteEndpoint(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  try {
    const endpoint = new URL(value);
    return endpoint.protocol === 'https:' || endpoint.protocol === 'http:' ? endpoint.href : undefined;
  } catch {
    return undefined;
  }
}

function browserCredentialStore(queue: ReportQueue): {
  read(): Promise<{ readonly deviceId: string; readonly credential: string } | undefined>;
  write(value: { readonly deviceId: string; readonly credential: string }): Promise<void>;
  clear(): Promise<void>;
} {
  return {
    read: async () => {
      const durable = await queue.identity?.read();
      if (durable !== undefined) {
        rememberCredential(durable);
        return durable;
      }
      const mirrored = recalledCredential();
      if (mirrored !== undefined) await queue.identity?.write(mirrored);
      return mirrored;
    },
    write: async (value) => {
      await queue.identity?.write(value);
      rememberCredential(value);
    },
    clear: async () => {
      await queue.identity?.clear();
      try {
        localStorage.removeItem(LOCAL_CREDENTIAL_KEY);
      } catch {
        // The queue remains authoritative if the optional mirror refuses removal.
      }
    },
  };
}

function recalledCredential(): { readonly deviceId: string; readonly credential: string } | undefined {
  try {
    const value = localStorage.getItem(LOCAL_CREDENTIAL_KEY);
    if (value === null) return undefined;
    const parsed = JSON.parse(value) as { deviceId?: unknown; credential?: unknown };
    return typeof parsed.deviceId === 'string' && typeof parsed.credential === 'string'
      ? { deviceId: parsed.deviceId, credential: parsed.credential }
      : undefined;
  } catch {
    return undefined;
  }
}

function rememberCredential(value: { readonly deviceId: string; readonly credential: string }): void {
  try {
    localStorage.setItem(LOCAL_CREDENTIAL_KEY, JSON.stringify(value));
  } catch {
    // IndexedDB remains the canonical durable queue when a browser refuses its optional mirror.
  }
}

/** The one call the reportar document makes. Every dependency is real: no fakes at this edge. */
export function mountReportIsland(doc: Document = document): void {
  const elements = findElements(doc);
  if (!elements) return;
  const spotId = elements.form.dataset.spotId;
  const locale = elements.form.dataset.locale as Locale | undefined;
  const spotName = elements.form.dataset.spotName;
  if (!spotId || !locale || !spotName) return;

  void activate(elements, spotId, locale, spotName).catch(() => {
    showNotice(elements.notice, STORAGE_REFUSED_MESSAGE);
  });
}

// ---------------------------------------------------------------------------
// Cold-load reveal (event ddc0ba7c). The reportado document ships no script
// of its own today, so it is permanently blank on a reload, a fresh tab, or
// a bookmark: the confirmation only ever paints as a side effect of the
// in-app transition activate() runs above, which a cold load never runs. The
// row survives in IndexedDB; only the address's ability to state that truth
// does not. This section re-derives the confirmation from durable storage
// alone, read-only -- no probe write, no queue.ts dependency, so a cold load
// never attempts a storage write just to look.
// ---------------------------------------------------------------------------

/** Read-only: true only if the phone durably holds a report for this spot. */
function hasQueuedReportForSpot(spotId: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onerror = () => reject(request.error ?? new Error('report reveal: indexedDB open failed'));
    request.onsuccess = () => {
      const db = request.result;
      const readAll = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
      readAll.onerror = () => {
        db.close();
        reject(readAll.error ?? new Error('report reveal: indexedDB read failed'));
      };
      readAll.onsuccess = () => {
        const rows = readAll.result as unknown[];
        db.close();
        resolve(rows.some((row) => isQueuedReportForSpot(row, spotId)));
      };
    };
  });
}

/** A committed row is stored as a parsed object (toStorable); a sentinel is a bare string. */
function isQueuedReportForSpot(row: unknown, spotId: string): boolean {
  return (
    typeof row === 'object'
    && row !== null
    && 'report_id' in row
    && (row as { spot_id?: unknown }).spot_id === spotId
  );
}

/**
 * ReportShell.astro (out of this step's files_to_modify) ships a plain,
 * unstyled "back to spot" paragraph as a static sibling of
 * [data-reveal-shell] -- the no-JS fallback a screen reader with JS disabled,
 * or a JS-less phone, would still land on. Once the island renders its own
 * styled nav or CTA inside the shell (renderRevealView, above), that static
 * fallback is redundant and reads as a second, competing way back -- exactly
 * the clutter this step's second-round finding flagged. Superseding static
 * markup once the island takes over is the same convention applyCommitUi
 * already uses for the reportar form (elements.form.remove()). Selector is
 * structural (the shell's only sibling <p> of `<main data-reveal-shell>`)
 * because ReportShell.astro carries no data attribute to hook; FLAGGED for
 * the orchestrator: fold this removal into ReportShell.astro directly once
 * that file has an owning step.
 */
function removeStaticFallbackLink(doc: Document): void {
  doc.querySelector('main[data-reveal-shell] + p')?.remove();
}

/**
 * The one call the reportado document makes. Cold-load-safe: re-derives the
 * confirmation from durable storage alone, assuming nothing about how the
 * document was reached. Every dependency is real: no fakes at this edge,
 * same convention as mountReportIsland. Spot identity and locale come from
 * the reveal address itself (parseSpotIdFromRevealPath /
 * parseLocaleFromRevealPath), same reasoning as the file-header note on
 * parseSpotIdFromRevealPath: ReportShell.astro carries no data-spot-id. The
 * display name alone comes from a hidden data-carrier element reportado.astro
 * renders as a sibling of its own <script> tag (a plain attribute on the
 * <script> tag itself defeats Astro's module bundling -- verified against the
 * real build output: it left the import statement un-transformed, a broken
 * script) -- NOT from src/data/region (its loader, src/data/launch-spots.ts,
 * reads the filesystem at module scope, a Node-only dependency graph this
 * island must never carry into a browser bundle; the same reasoning
 * report-record.ts and queue.ts already document for src/data/forecast, leak
 * path L1, applies here as a build-time-vs-runtime split rather than a
 * domain leak).
 */
export async function mountReportReveal(doc: Document = document): Promise<void> {
  const container = doc.querySelector<HTMLElement>('[data-reveal-shell]');
  if (!container) return;
  const pathname = doc.location?.pathname ?? '';
  const spotId = parseSpotIdFromRevealPath(pathname);
  if (!spotId) return;
  const locale = parseLocaleFromRevealPath(pathname);
  const spotName = doc.querySelector<HTMLElement>('[data-reveal-spot-name]')?.dataset.revealSpotName;
  if (!spotName) return;

  const links: RevealLinks = {
    backHref: paths.spot(locale, spotId),
    backLabel: spotName,
    reportHref: paths.report(locale, spotId),
    reportLabel: strings[locale].spot.reportCta,
  };
  const hasQueuedReport = await hasQueuedReportForSpot(spotId).catch(() => false);
  renderRevealView(container, decideRevealUi(hasQueuedReport, links));
  removeStaticFallbackLink(doc);
}
