// A whole-source examination for safety rules that are claims about the
// entire shipped tree, not about one execution: today, that only the gate
// may ever mark a correction applied (06-learning-layer.md section 7). Later
// rules (a wind residual must bring its own noise floor, section 8) read the
// same inventory this module already collects; this module does not yet
// enforce that second rule.
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

/** The one rule this examination can report a violation for today. */
export const RULE_ONLY_THE_GATE_MAY_MARK_APPLIED = 'only-the-gate-may-mark-a-correction-applied';

/** A module allowed to construct the applied state: any file whose basename starts with this. */
const GATE_MODULE_PREFIX = 'gates';

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

  for (const filePath of files) {
    const text = await readFile(filePath, 'utf8');
    const declared = declarationsOfFile(filePath, text);
    residualForms.push(...declared.residualForms);
    Object.assign(noiseFloors, declared.noiseFloors);
    appliedMarkingSites.push(...declared.appliedMarkingSites);
  }

  return {
    residual_forms: dedupe(residualForms),
    noise_floors: noiseFloors,
    applied_marking_sites: appliedMarkingSites,
    violations: onlyTheGateMayMarkAppliedViolations(appliedMarkingSites),
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

// ---------- per-file syntax scan ----------

type FileDeclarations = {
  residualForms: string[];
  noiseFloors: Record<string, NoiseFloor>;
  appliedMarkingSites: string[];
};

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
