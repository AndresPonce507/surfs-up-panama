// A whole-source examination for safety rules that are claims about the
// entire shipped tree, not about one execution: only the gate may ever mark
// a correction applied (06-learning-layer.md section 7), and a wind residual
// may never ship without its own noise floor (section 8). Both rules read
// the same inventory this module collects.
//
// The universe under examination is read as TEXT and scanned as SYNTAX ONLY.
// Nothing here ever imports, requires, or executes a file it examines: it
// walks the directory tree, reads each file's bytes, and looks at the
// characters. That is load bearing -- an examination that imported the
// universe under examination would run it, and this module has to be able to
// examine the very source tree it ships inside of.
//
// Mechanism note: the obvious tool would be the `typescript` package's
// classic compiler API (`ts.createSourceFile`, `ts.forEachChild`). The
// `typescript` devDependency pinned in this repo is 7.0.2, the native-port
// preview line, and it does not export that API any more: the package root
// resolves to a version stub, and `typescript/unstable/ast` exports the
// `is*` node predicates and `SyntaxKind` but no parser, while the only
// parser on offer (`typescript/unstable/sync` / `.../async`) is a full
// `Project`/`Program` built for a real tsconfig and a native host process --
// too heavy and too slow to spin up per examined file. So this module is a
// small hand-rolled lexer instead: it tracks comments, string literals, and
// `type` / `interface` declaration spans well enough to tell a value
// position from a type position, which is precisely and only what the rule
// below needs. It adds no dependency.
//
// Known, accepted narrowness of that lexer (documented rather than hidden):
// it does not track `<...>` generic parameter lists, so a `type` alias with
// a generic default value (`type Foo<T = X> = ...`) could mis-measure its
// own span. No declaration in this repo does that today.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Only the gate may ever construct the applied state (06-learning-layer.md section 7). */
export const RULE_ONLY_THE_GATE_MAY_MARK_APPLIED = 'only-the-gate-may-mark-a-correction-applied';

/**
 * A declared r_wind residual form must bring its own noise floor, derived
 * from the wind label's own confusion structure rather than borrowed from
 * height (06-learning-layer.md section 8). Naming the token `r_wind` here,
 * in the examiner's own source, is not "creating r_wind in shipped source":
 * it is the same data-and-documentation use the module header already makes
 * for `RESIDUAL_FORMS` and the token `'applied'`, and SELF_PATH excludes
 * this file from every walk for exactly that reason.
 */
export const RULE_WIND_RESIDUAL_NEEDS_ITS_OWN_FLOOR = 'a-wind-residual-must-bring-its-own-noise-floor';

/**
 * A declared CV_SCHEME whose kind shuffles time is banned outright, not
 * merely unused (06-learning-layer.md section 7 row G7): consecutive hours
 * of one swell are near-duplicates, so a shuffled split leaks the very thing
 * it claims to hold out and flatters whatever correction it judges. The one
 * legal shape is rolling-origin blocked time. A universe that declares no
 * CV_SCHEME at all is not in violation -- absence is legal, only the wrong
 * shape is not.
 */
export const RULE_HELD_OUT_STAYS_FORWARD_OF_TRAINING = 'held-out-mornings-must-stay-forward-of-training';

/** A module allowed to construct the applied state: any file whose basename starts with this. */
const GATE_MODULE_PREFIX = 'gates';

/** The only legal CV_SCHEME.kind (06-learning-layer.md section 7 row G7). */
const LEGAL_CV_SCHEME_KIND = 'rolling_origin_blocked';

/** The residual form whose noise floor this rule requires. */
const WIND_RESIDUAL_FORM = 'r_wind';
/** The key under SIGMA_EFF a wind noise floor must be declared at. */
const WIND_FLOOR_KEY = 'wind';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const EXCLUDED_DIRECTORIES = new Set(['node_modules', '.git', 'dist', '.astro']);

/**
 * This module's own absolute path. It is excluded from every walk: this file
 * necessarily names its own target patterns -- the identifiers
 * `RESIDUAL_FORMS` and `SIGMA_EFF`, the token `'applied'` -- in its own
 * source text, as data and as documentation. An examiner is not the universe
 * it examines; excluding it is the same choice a linter makes about its own
 * source.
 */
const SELF_PATH = path.resolve(fileURLToPath(import.meta.url));

export type NoiseFloor = { value: number; derived_from: string };

export type LearningDeclarationsViolation = { rule: string; detail: string };

export type LearningDeclarationsReport = {
  /** Every residual form declared anywhere in the universe. An inventory, never a rule. */
  residual_forms: string[];
  /** Every single-sample noise floor declared anywhere in the universe, keyed by variable. */
  noise_floors: Record<string, NoiseFloor>;
  /** Every file that can produce the applied state, gate module included. */
  applied_marking_sites: string[];
  violations: LearningDeclarationsViolation[];
};

export async function evaluateLearningDeclarations(input: { root: string }): Promise<LearningDeclarationsReport> {
  const files = await sourceFilesUnder(input.root);

  const residualForms: string[] = [];
  const noiseFloors: Record<string, NoiseFloor> = {};
  const appliedMarkingSites: string[] = [];
  const cvSchemes: DeclaredCvScheme[] = [];

  for (const filePath of files) {
    const text = await readFile(filePath, 'utf8');
    const declared = declarationsOfFile(filePath, text);
    residualForms.push(...declared.residualForms);
    Object.assign(noiseFloors, declared.noiseFloors);
    appliedMarkingSites.push(...declared.appliedMarkingSites);
    cvSchemes.push(...declared.cvSchemes);
  }

  const dedupedResidualForms = dedupe(residualForms);

  return {
    residual_forms: dedupedResidualForms,
    noise_floors: noiseFloors,
    applied_marking_sites: appliedMarkingSites,
    violations: [
      ...onlyTheGateMayMarkAppliedViolations(appliedMarkingSites),
      ...windResidualNeedsItsOwnFloorViolations(dedupedResidualForms, noiseFloors),
      ...heldOutMorningsStayForwardViolations(cvSchemes),
    ],
  };
}

// ---------- directory walk (I/O boundary) ----------

async function sourceFilesUnder(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue;
    const fullPath = path.join(entry.parentPath, entry.name);
    if (path.resolve(fullPath) === SELF_PATH) continue;
    if (isUnderExcludedDirectory(root, fullPath)) continue;
    files.push(fullPath);
  }
  return files;
}

function isUnderExcludedDirectory(root: string, fullPath: string): boolean {
  const relative = path.relative(root, fullPath);
  return relative.split(path.sep).some((segment) => EXCLUDED_DIRECTORIES.has(segment));
}

// ---------- the rule (criterion 3) ----------

function onlyTheGateMayMarkAppliedViolations(sites: readonly string[]): LearningDeclarationsViolation[] {
  return sites
    .filter((site) => !path.basename(site).startsWith(GATE_MODULE_PREFIX))
    .map((site) => ({
      rule: RULE_ONLY_THE_GATE_MAY_MARK_APPLIED,
      detail: `${site} can mark a correction applied without the gate having weighed the evidence`,
    }));
}

// ---------- the rule (01-04 criteria 1-3) ----------

/**
 * A declared r_wind residual makes a numeric claim, and a numeric claim with
 * no noise floor would let its significance gate rest on the sample's own
 * agreement alone -- the coordinated-lying vulnerability the floor exists to
 * close. A floor is only a floor if it is derived from wind's own confusion
 * structure: one borrowed from height is the wrong shape for a three-word
 * categorical label and does not satisfy the rule (criterion 3).
 */
function windResidualNeedsItsOwnFloorViolations(
  residualForms: readonly string[],
  noiseFloors: Record<string, NoiseFloor>,
): LearningDeclarationsViolation[] {
  if (!residualForms.includes(WIND_RESIDUAL_FORM)) return [];

  const windFloor = noiseFloors[WIND_FLOOR_KEY];
  if (windFloor !== undefined && derivedFromNamesTheWindLabelsOwnConfusionStructure(windFloor.derived_from)) {
    return [];
  }

  const detail =
    windFloor === undefined
      ? `${WIND_RESIDUAL_FORM} is declared with no ${WIND_FLOOR_KEY} entry in SIGMA_EFF at all, so its significance gate would rest on the sample's agreement alone`
      : `the ${WIND_FLOOR_KEY} noise floor's derived_from ("${windFloor.derived_from}") does not name the wind label's own confusion structure`;

  return [{ rule: RULE_WIND_RESIDUAL_NEEDS_ITS_OWN_FLOOR, detail }];
}

/** Must name wind's own confusion structure; a derivation still naming height is borrowed, not earned. */
function derivedFromNamesTheWindLabelsOwnConfusionStructure(derivedFrom: string): boolean {
  return /wind/i.test(derivedFrom) && !/height/i.test(derivedFrom);
}

// ---------- the rule (05-03 criteria 1-2) ----------

/** Every declared CV_SCHEME whose kind is anything but the one legal shape is a violation, wherever it ships. */
function heldOutMorningsStayForwardViolations(schemes: readonly DeclaredCvScheme[]): LearningDeclarationsViolation[] {
  return schemes
    .filter((scheme) => scheme.kind !== LEGAL_CV_SCHEME_KIND)
    .map((scheme) => ({
      rule: RULE_HELD_OUT_STAYS_FORWARD_OF_TRAINING,
      detail: `${scheme.filePath} declares CV_SCHEME.kind ${JSON.stringify(scheme.kind)}; held-out mornings must stay forward of training`,
    }));
}

// ---------- per-file syntax scan ----------

type FileDeclarations = {
  residualForms: string[];
  noiseFloors: Record<string, NoiseFloor>;
  appliedMarkingSites: string[];
  cvSchemes: DeclaredCvScheme[];
};

/** One declared `CV_SCHEME` const, and the file it was found in. `kind` is `null` when the literal has no `kind` field. */
type DeclaredCvScheme = { filePath: string; kind: string | null };

function declarationsOfFile(filePath: string, text: string): FileDeclarations {
  const { comments, strings } = lexStringsAndComments(text);
  const commentMasked = blank(text, comments);
  const codeMasked = blank(commentMasked, strings);
  const typeSpans = typeDeclarationSpans(codeMasked);
  const valueOnlyCode = blank(codeMasked, typeSpans);

  const marksApplied =
    hasAppliedTrueLiteral(valueOnlyCode) || hasGateTokenOutsideTypePositions(strings, typeSpans);

  return {
    residualForms: residualFormsDeclaredIn(commentMasked),
    noiseFloors: noiseFloorsDeclaredIn(commentMasked),
    appliedMarkingSites: marksApplied ? [filePath] : [],
    cvSchemes: cvSchemesDeclaredIn(filePath, commentMasked),
  };
}

// ---------- marking-site patterns (criterion 4: value positions only) ----------

/** `applied: true` as an actual value, never `applied: boolean` (a type) or `applied: verdict.applied` (a carry). */
const APPLIED_TRUE_LITERAL = /\bapplied\s*:\s*true\b/;

function hasAppliedTrueLiteral(valueOnlyCode: string): boolean {
  return APPLIED_TRUE_LITERAL.test(valueOnlyCode);
}

/** The gate token `'applied'` constructed as a string value, outside every `type`/`interface` span. */
function hasGateTokenOutsideTypePositions(strings: readonly StringSpan[], typeSpans: readonly Span[]): boolean {
  return strings.some((stringSpan) => stringSpan.content === 'applied' && !isWithinAnySpan(stringSpan.start, typeSpans));
}

// ---------- inventory extraction (criterion 1; not a rule, see module header) ----------

function residualFormsDeclaredIn(commentMaskedText: string): string[] {
  const body = bracketedBodyAfter(commentMaskedText, 'RESIDUAL_FORMS', '[', ']');
  if (body === undefined) return [];
  return [...body.matchAll(/'([^']*)'|"([^"]*)"/g)].map((match) => match[1] ?? match[2] ?? '');
}

function noiseFloorsDeclaredIn(commentMaskedText: string): Record<string, NoiseFloor> {
  const body = bracketedBodyAfter(commentMaskedText, 'SIGMA_EFF', '{', '}');
  if (body === undefined) return {};

  const floors: Record<string, NoiseFloor> = {};
  const entryPattern =
    /([A-Za-z_$][\w$]*)\s*:\s*\{\s*value\s*:\s*(-?[\d.]+)\s*,\s*derived_from\s*:\s*(?:'([^']*)'|"([^"]*)")/g;
  for (const match of body.matchAll(entryPattern)) {
    const key = match[1];
    const derivedFrom = match[3] ?? match[4];
    if (key === undefined || derivedFrom === undefined) continue;
    floors[key] = { value: Number(match[2]), derived_from: derivedFrom };
  }
  return floors;
}

/**
 * Every literal `CV_SCHEME` declaration is source evidence, not executable
 * configuration -- a file may declare it more than once (each is its own
 * violation candidate), so this walks every occurrence rather than the
 * single-marker `bracketedBodyAfter` the two rules above use.
 */
function cvSchemesDeclaredIn(filePath: string, commentMaskedText: string): DeclaredCvScheme[] {
  const declarations: DeclaredCvScheme[] = [];
  const declarationStart = /(?:^|\n)\s*(?:export\s+)?const\s+CV_SCHEME\b/g;
  for (const match of commentMaskedText.matchAll(declarationStart)) {
    const start = match.index ?? 0;
    const equalsIndex = commentMaskedText.indexOf('=', start);
    const openIndex = equalsIndex === -1 ? -1 : commentMaskedText.indexOf('{', equalsIndex);
    if (openIndex === -1) {
      declarations.push({ filePath, kind: null });
      continue;
    }
    const closeIndex = matchingCloseIndex(commentMaskedText, openIndex, '{', '}');
    const body =
      closeIndex === -1 ? commentMaskedText.slice(openIndex + 1) : commentMaskedText.slice(openIndex + 1, closeIndex);
    const kindMatch = /\bkind\s*:\s*(?:'([^']*)'|"([^"]*)")/.exec(body);
    declarations.push({ filePath, kind: kindMatch?.[1] ?? kindMatch?.[2] ?? null });
  }
  return declarations;
}

/**
 * The bracketed literal assigned to `export const <marker>[: Type] = <literal>;`.
 * The search for the opening bracket starts at the declaration's `=`, never at
 * the marker itself, because a type annotation between the name and the `=`
 * (`SIGMA_EFF: Record<string, { value: number; ... }>`) can contain the same
 * bracket character and is not the value.
 */
function bracketedBodyAfter(text: string, marker: string, openChar: string, closeChar: string): string | undefined {
  const markerMatch = new RegExp(`\\b${marker}\\b`).exec(text);
  if (markerMatch === null) return undefined;
  const equalsIndex = text.indexOf('=', markerMatch.index);
  if (equalsIndex === -1) return undefined;
  const openIndex = text.indexOf(openChar, equalsIndex);
  if (openIndex === -1) return undefined;
  const closeIndex = matchingCloseIndex(text, openIndex, openChar, closeChar);
  if (closeIndex === -1) return undefined;
  return text.slice(openIndex + 1, closeIndex);
}

// ---------- small lexer: comments, strings, and type-declaration spans ----------

type Span = { start: number; end: number };
type StringSpan = Span & { content: string };

function lexStringsAndComments(text: string): { comments: Span[]; strings: StringSpan[] } {
  const comments: Span[] = [];
  const strings: StringSpan[] = [];
  let i = 0;
  while (i < text.length) {
    const char = text.charAt(i);
    const next = text.charAt(i + 1);

    if (char === '/' && next === '/') {
      const end = indexOfOrEnd(text, '\n', i);
      comments.push({ start: i, end });
      i = end;
      continue;
    }
    if (char === '/' && next === '*') {
      const closeAt = text.indexOf('*/', i + 2);
      const end = closeAt === -1 ? text.length : closeAt + 2;
      comments.push({ start: i, end });
      i = end;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      const closeIndex = closingQuoteIndex(text, i, char);
      const end = closeIndex === -1 ? text.length : closeIndex + 1;
      strings.push({ start: i, end, content: text.slice(i + 1, closeIndex === -1 ? text.length : closeIndex) });
      i = end;
      continue;
    }
    i += 1;
  }
  return { comments, strings };
}

function closingQuoteIndex(text: string, openIndex: number, quote: string): number {
  let i = openIndex + 1;
  while (i < text.length) {
    const char = text.charAt(i);
    if (char === '\\') {
      i += 2;
      continue;
    }
    if (char === quote) return i;
    i += 1;
  }
  return -1;
}

function indexOfOrEnd(text: string, needle: string, fromIndex: number): number {
  const found = text.indexOf(needle, fromIndex);
  return found === -1 ? text.length : found;
}

/** Every `type X = ...;` or `interface X { ... }` span (criterion 4: these are never value positions). */
function typeDeclarationSpans(codeMaskedText: string): Span[] {
  const spans: Span[] = [];
  const declarationStart = /\b(type|interface)\b\s+[A-Za-z_$][\w$]*/g;
  let match: RegExpExecArray | null = declarationStart.exec(codeMaskedText);
  while (match !== null) {
    const keyword = match[1];
    const start = match.index;
    const afterName = declarationStart.lastIndex;

    if (keyword === 'interface') {
      const closeIndex = matchingCloseIndex(codeMaskedText, codeMaskedText.indexOf('{', afterName), '{', '}');
      if (closeIndex !== -1) spans.push({ start, end: closeIndex + 1 });
    } else {
      const equalsIndex = codeMaskedText.indexOf('=', afterName);
      if (equalsIndex !== -1) {
        const semicolonIndex = topLevelSemicolonAfter(codeMaskedText, equalsIndex);
        spans.push({ start, end: semicolonIndex + 1 });
      }
    }
    match = declarationStart.exec(codeMaskedText);
  }
  return spans;
}

function topLevelSemicolonAfter(text: string, fromIndex: number): number {
  let depth = 0;
  for (let i = fromIndex; i < text.length; i += 1) {
    const char = text.charAt(i);
    if (char === '{' || char === '[' || char === '(') depth += 1;
    if (char === '}' || char === ']' || char === ')') depth -= 1;
    if (char === ';' && depth <= 0) return i;
  }
  return text.length - 1;
}

function matchingCloseIndex(text: string, openIndex: number, openChar: string, closeChar: string): number {
  if (openIndex === -1) return -1;
  let depth = 0;
  for (let i = openIndex; i < text.length; i += 1) {
    const char = text.charAt(i);
    if (char === openChar) depth += 1;
    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function isWithinAnySpan(position: number, spans: readonly Span[]): boolean {
  return spans.some((span) => position >= span.start && position < span.end);
}

// ---------- small helpers ----------

function blank(text: string, spans: readonly Span[]): string {
  if (spans.length === 0) return text;
  const chars = [...text];
  for (const span of spans) {
    for (let i = span.start; i < span.end; i += 1) {
      if (chars[i] !== '\n') chars[i] = ' ';
    }
  }
  return chars.join('');
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)];
}
