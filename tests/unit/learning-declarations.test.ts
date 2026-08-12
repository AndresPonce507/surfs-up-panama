// Unit-level, example-shaped tests for the whole-source examination
// (src/learning/declarations.ts). Test paradigm EXEMPT from the property
// default for this step (DISTILL implementation notes for 01-02): the
// examination's own contract is a fixed set of syntactic shapes, not a
// domain invariant over a generated space, so scratch universes built
// on-disk are the right tool. Each test proves one falsifiable claim: a
// planted violation is caught, and a legitimate construct is spared.
//
// Real filesystem I/O throughout, no mocks: this module's entire job is to
// read real files, so a mocked filesystem would test nothing about it.

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  RULE_HELD_OUT_STAYS_FORWARD_OF_TRAINING,
  RULE_ONLY_THE_GATE_MAY_MARK_APPLIED,
  RULE_WIND_RESIDUAL_NEEDS_ITS_OWN_FLOOR,
  evaluateLearningDeclarations,
} from '../../src/learning/declarations';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'learning-declarations-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function writeUniverse(files: Record<string, string>): Promise<void> {
  for (const [relativePath, contents] of Object.entries(files)) {
    const fullPath = join(root, relativePath);
    await mkdir(join(fullPath, '..'), { recursive: true });
    await writeFile(fullPath, contents, 'utf8');
  }
}

describe('evaluateLearningDeclarations', () => {
  it('returns the full report shape and reads the declared inventory, for any root given', async () => {
    await writeUniverse({
      'learning-source.ts': [
        "export const RESIDUAL_FORMS = ['r_height', 'r_score'] as const;",
        '',
        'export const SIGMA_EFF: Record<string, { value: number; derived_from: string }> = {',
        "  height: { value: 0.48, derived_from: 'height-error-decomposition' },",
        "  score: { value: 25, derived_from: 'one-quality-anchor-step' },",
        '};',
      ].join('\n'),
    });

    const report = await evaluateLearningDeclarations({ root });

    expect(report.residual_forms.slice().sort()).toEqual(['r_height', 'r_score']);
    expect(report.noise_floors).toEqual({
      height: { value: 0.48, derived_from: 'height-error-decomposition' },
      score: { value: 25, derived_from: 'one-quality-anchor-step' },
    });
    expect(report.applied_marking_sites).toEqual([]);
    expect(report.violations).toEqual([]);
  });

  it('flags a literal applied: true outside a gate-named module as a violation (falsifiable: plant it, catch it)', async () => {
    await writeUniverse({
      'emitter.ts': [
        'export function emitCorrectionKey(input: { n: number }): { applied: boolean } {',
        '  return { applied: true };',
        '}',
      ].join('\n'),
    });

    const report = await evaluateLearningDeclarations({ root });

    expect(report.applied_marking_sites).toEqual([join(root, 'emitter.ts')]);
    expect(report.violations).toEqual([
      {
        rule: RULE_ONLY_THE_GATE_MAY_MARK_APPLIED,
        detail: `${join(root, 'emitter.ts')} can mark a correction applied without the gate having weighed the evidence`,
      },
    ]);
  });

  it('flags the gate token \'applied\' constructed as a string value outside a gate-named module, with no applied: true literal present (falsifiable: plant it, catch it)', async () => {
    await writeUniverse({
      'emitter.ts': [
        'export function emitCorrectionKey(input: { n: number }): { gate: string } {',
        "  return { gate: 'applied' };",
        '}',
      ].join('\n'),
    });

    const report = await evaluateLearningDeclarations({ root });

    expect(report.applied_marking_sites).toEqual([join(root, 'emitter.ts')]);
    expect(report.violations).toEqual([
      {
        rule: RULE_ONLY_THE_GATE_MAY_MARK_APPLIED,
        detail: `${join(root, 'emitter.ts')} can mark a correction applied without the gate having weighed the evidence`,
      },
    ]);
  });

  it('does not treat carrying a verdict through as a marking site: it cannot invent the state, only carry it', async () => {
    await writeUniverse({
      'emitter.ts': [
        "import { gateCorrection } from './gates';",
        '',
        'export function emitCorrectionKey(input: { n: number; reporters: number; b: number; se: number }): { applied: boolean } {',
        '  const verdict = gateCorrection(input);',
        '  return { applied: verdict.applied };',
        '}',
      ].join('\n'),
      'gates.ts': [
        'export function gateCorrection(input: { n: number; reporters: number; b: number; se: number }): { applied: boolean; reason: string } {',
        "  if (input.n < 10) return { applied: false, reason: 'n_lt_10' };",
        "  return { applied: true, reason: 'applied' };",
        '}',
      ].join('\n'),
    });

    const report = await evaluateLearningDeclarations({ root });

    expect(report.applied_marking_sites).toEqual([join(root, 'gates.ts')]);
    expect(report.violations).toEqual([]);
  });

  it('treats the CorrectionGate union member and the CorrectionRecord applied field as type declarations, not marking sites', async () => {
    await writeUniverse({
      'engine.ts': [
        "export type CorrectionGate = 'no_file' | 'n_lt_10' | 'reporters_lt_5' | 'not_significant' | 'applied';",
        '',
        'export type CorrectionRecord = {',
        '  score_delta?: {',
        '    applied: boolean;',
        '  };',
        '};',
      ].join('\n'),
    });

    const report = await evaluateLearningDeclarations({ root });

    expect(report.applied_marking_sites).toEqual([]);
    expect(report.violations).toEqual([]);
  });

  it('does not violate the rule when the applied state is constructed inside a module named gates', async () => {
    await writeUniverse({
      'gates.ts': [
        'export function gateCorrection(input: { n: number }): { applied: boolean; reason: string } {',
        "  return { applied: true, reason: 'applied' };",
        '}',
      ].join('\n'),
    });

    const report = await evaluateLearningDeclarations({ root });

    expect(report.applied_marking_sites).toEqual([join(root, 'gates.ts')]);
    expect(report.violations).toEqual([]);
  });

  it('never imports the universe it examines: a file that throws if executed does not stop the examination', async () => {
    await writeUniverse({
      'would-crash-if-imported.ts': [
        "throw new Error('this module must never run inside the examination');",
      ].join('\n'),
    });

    await expect(evaluateLearningDeclarations({ root })).resolves.toBeDefined();
  });

  it('flags a declared r_wind residual with no wind noise floor at all as a violation (falsifiable: plant it, catch it)', async () => {
    await writeUniverse({
      'learning-source.ts': [
        "export const RESIDUAL_FORMS = ['r_height', 'r_wind'] as const;",
        '',
        'export const SIGMA_EFF: Record<string, { value: number; derived_from: string }> = {',
        "  height: { value: 0.48, derived_from: 'height-error-decomposition' },",
        '};',
      ].join('\n'),
    });

    const report = await evaluateLearningDeclarations({ root });

    expect(report.violations).toContainEqual({
      rule: RULE_WIND_RESIDUAL_NEEDS_ITS_OWN_FLOOR,
      detail: expect.any(String),
    });
  });

  it('does not violate the wind floor rule when the wind floor is derived from the wind label\'s own confusion structure', async () => {
    await writeUniverse({
      'learning-source.ts': [
        "export const RESIDUAL_FORMS = ['r_height', 'r_wind'] as const;",
        '',
        'export const SIGMA_EFF: Record<string, { value: number; derived_from: string }> = {',
        "  height: { value: 0.48, derived_from: 'height-error-decomposition' },",
        "  wind: { value: 0.31, derived_from: 'wind-label-confusion-structure' },",
        '};',
      ].join('\n'),
    });

    const report = await evaluateLearningDeclarations({ root });

    expect(report.violations.filter((violation) => violation.rule === RULE_WIND_RESIDUAL_NEEDS_ITS_OWN_FLOOR)).toEqual(
      [],
    );
  });

  it('flags a wind floor whose derivation still names height as a violation, even when it also names wind (falsifiable: plant it, catch it)', async () => {
    await writeUniverse({
      'learning-source.ts': [
        "export const RESIDUAL_FORMS = ['r_wind'] as const;",
        '',
        'export const SIGMA_EFF: Record<string, { value: number; derived_from: string }> = {',
        "  wind: { value: 0.48, derived_from: 'wind-floor-borrowed-from-height-metres' },",
        '};',
      ].join('\n'),
    });

    const report = await evaluateLearningDeclarations({ root });

    expect(report.violations).toContainEqual({
      rule: RULE_WIND_RESIDUAL_NEEDS_ITS_OWN_FLOOR,
      detail: expect.any(String),
    });
  });
});

// 05-03: unlike the two rules above (fixed syntactic shapes -- one literal
// token, one specific residual form), rule three's contract genuinely
// generalizes over the whole space of declared CV_SCHEME.kind strings, so a
// property law is the right tool here even though the file header's default
// exemption stands for the two example-shaped rules above it.
describe('held-out mornings must stay forward of training (06-learning-layer.md section 7 G7)', () => {
  it('refuses every declared CV_SCHEME whose kind is not rolling_origin_blocked, naming the rule, the file, and the kind, for any generated kind', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[a-z][a-z_]{0,19}$/).filter((kind) => kind !== 'rolling_origin_blocked'),
        async (kind) => {
          await writeUniverse({
            'evaluation.ts': [`export const CV_SCHEME = { kind: '${kind}', folds: 10 } as const;`].join('\n'),
          });

          const report = await evaluateLearningDeclarations({ root });

          const fired = report.violations.filter((violation) => violation.rule === RULE_HELD_OUT_STAYS_FORWARD_OF_TRAINING);
          expect(fired).toHaveLength(1);
          expect(fired[0]?.detail).toContain(join(root, 'evaluation.ts'));
          expect(fired[0]?.detail).toContain(kind);
        },
      ),
      { numRuns: 25 },
    );
  });

  it('accepts a universe that declares no CV_SCHEME at all: absence is legal, not a violation', async () => {
    await writeUniverse({
      'plain-module.ts': ['export function double(n: number): number {', '  return n * 2;', '}'].join('\n'),
    });

    const report = await evaluateLearningDeclarations({ root });

    expect(report.violations.filter((violation) => violation.rule === RULE_HELD_OUT_STAYS_FORWARD_OF_TRAINING)).toEqual([]);
  });
});
