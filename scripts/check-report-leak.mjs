#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_ROOT = resolve(REPOSITORY_ROOT, 'src');
const REPORT_ENTRYPOINTS = ['pages/spots/[slug]/reportar.astro', 'pages/spots/[slug]/reportado.astro'];
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.astro'];

// `size_band` is deliberately absent: it is the surfer's observed answer.
export const FORECAST_MARKERS = Object.freeze([
  'score_q', 'size_range_m', 'wind_state', 'conf_level', 'confidence_reason',
  'weakest_link', 'best_window', 'predicted', 'data-forecast',
]);

export function detectForecastMarkers(text) {
  return FORECAST_MARKERS.filter((marker) => text.includes(marker));
}

function walkFiles(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return walkFiles(path);
    return entry.isFile() ? [path] : [];
  });
}

function reportDocuments(distRoot) {
  return walkFiles(distRoot).filter((path) => /(?:^|[\\/])(?:reportar|reportado)\.html$/.test(path)).sort();
}

function isExternalReference(href) {
  return href.startsWith('#') || href.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(href);
}

function referencedAssets(documentBody) {
  const references = new Set();
  for (const tag of documentBody.matchAll(/<(script|link)\b[^>]*>/gi)) {
    const [rawTag, tagName] = tag;
    const attribute = tagName.toLowerCase() === 'script' ? 'src' : 'href';
    const reference = new RegExp(`\\b${attribute}=["']([^"']+)["']`, 'i').exec(rawTag)?.[1];
    if (!reference || isExternalReference(reference)) continue;
    if (tagName.toLowerCase() === 'link') {
      const rel = /\brel=["']([^"']+)["']/i.exec(rawTag)?.[1]?.toLowerCase() ?? '';
      if (!/\b(?:stylesheet|modulepreload|preload|icon)\b/.test(rel)) continue;
    }
    references.add(reference.split(/[?#]/, 1)[0]);
  }
  return [...references].sort();
}

function resolveReferencedAsset(distRoot, documentPath, href) {
  const candidate = href.startsWith('/') ? resolve(distRoot, href.slice(1)) : resolve(dirname(documentPath), href);
  return candidate.startsWith(`${distRoot}/`) || candidate === distRoot ? candidate : undefined;
}

function sourceImports(source) {
  const imports = new Set();
  const expression = /(?:import|export)\s+(?:[^'"()]*?\s+from\s+)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of source.matchAll(expression)) imports.add(match[1] ?? match[2]);
  return [...imports];
}

function resolveSourceImport(from, specifier) {
  if (!specifier.startsWith('.')) return undefined;
  const unresolved = resolve(dirname(from), specifier);
  const candidates = [
    unresolved,
    ...SOURCE_EXTENSIONS.map((extension) => `${unresolved}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => join(unresolved, `index${extension}`)),
  ];
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}

function isForbiddenReportDependency(sourceRoot, path) {
  const normalized = relative(sourceRoot, path).replaceAll('\\', '/');
  return normalized === 'data/forecast.ts'
    || normalized.startsWith('forecast/')
    || normalized.startsWith('publish/')
    || normalized.startsWith('pipeline/');
}

export function findForbiddenReportImports(sourceRoot = SOURCE_ROOT) {
  const findings = [];
  for (const entryRelativePath of REPORT_ENTRYPOINTS) {
    const entry = resolve(sourceRoot, entryRelativePath);
    if (!existsSync(entry)) continue;
    const visited = new Set();
    const visit = (path, chain) => {
      if (visited.has(path)) return;
      visited.add(path);
      for (const specifier of sourceImports(readFileSync(path, 'utf8'))) {
        const imported = resolveSourceImport(path, specifier);
        if (!imported) continue;
        const nextChain = [...chain, imported];
        if (isForbiddenReportDependency(sourceRoot, imported)) {
          findings.push({ entry, chain: nextChain });
        } else {
          visit(imported, nextChain);
        }
      }
    };
    visit(entry, [entry]);
  }
  return findings;
}

function formatPath(root, path) {
  return relative(root, path).replaceAll('\\', '/') || '.';
}

export function checkReportLeak({ distRoot, sourceRoot = SOURCE_ROOT }) {
  const root = resolve(distRoot);
  const findings = [];
  const documents = reportDocuments(root);
  if (!existsSync(root)) {
    findings.push(`WHAT: dist root ${root} does not exist. WHY: an absent build cannot prove the report flow is clean. HOW: run npm run build, then pass --dist <built-root>.`);
  } else if (!documents.length) {
    findings.push(`WHAT: ${root} has no reportar.html or reportado.html route. WHY: the gate would have no report flow to inspect. HOW: build the report routes before running the gate.`);
  }

  const scanned = [];
  for (const document of documents) {
    const route = formatPath(root, document);
    scanned.push(route);
    const surfaces = [{ label: route, path: document }];
    for (const href of referencedAssets(readFileSync(document, 'utf8'))) {
      const asset = resolveReferencedAsset(root, document, href);
      if (!asset || !existsSync(asset)) {
        findings.push(`WHAT: ${route} references missing asset ${href}. WHY: a missing asset cannot be checked for forecast leakage. HOW: restore the emitted asset or remove the reference.`);
      } else {
        surfaces.push({ label: `${route} -> ${href}`, path: asset });
      }
    }
    for (const surface of surfaces) {
      for (const marker of detectForecastMarkers(readFileSync(surface.path, 'utf8'))) {
        findings.push(`WHAT: ${surface.label} leaks forecast marker ${marker}. WHY: report capture must not receive a prediction before the surfer commits an observation. HOW: remove ${marker} and the forecast payload from the report route or asset.`);
      }
    }
  }

  for (const finding of findForbiddenReportImports(sourceRoot)) {
    const chain = finding.chain.map((path) => formatPath(sourceRoot, path)).join(' -> ');
    findings.push(`WHAT: report-flow import reaches a forbidden forecast/publish/pipeline module: ${chain}. WHY: a transitive import can deliver forecast data even when the document looks clean. HOW: keep report flow dependent only on capture and observation modules.`);
  }

  if (findings.length) return { exitCode: 1, output: findings };
  return {
    exitCode: 0,
    output: [
      `PASS: report leak gate examined dist root ${root}.`,
      `SCOPE: ${documents.length} report route(s): ${scanned.join(', ')}; every referenced local script, stylesheet, preload, and icon asset.`,
      `MARKERS: ${FORECAST_MARKERS.join(', ')}.`,
      'IMPORT RULE: native recursive report-flow walk found no reach into forecast, publish, or pipeline; matching dependency-cruiser rule is declared in .dependency-cruiser.cjs.',
    ],
  };
}

function parseArguments(argv) {
  const distFlag = argv.indexOf('--dist');
  if (distFlag === -1 || !argv[distFlag + 1] || argv.length !== 2) return undefined;
  return { distRoot: argv[distFlag + 1] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseArguments(process.argv.slice(2));
  if (!options) {
    process.stderr.write('Usage: node scripts/check-report-leak.mjs --dist <built-root>\n');
    process.exitCode = 2;
  } else {
    const result = checkReportLeak(options);
    process.stdout.write(`${result.output.join('\n')}\n`);
    process.exitCode = result.exitCode;
  }
}
