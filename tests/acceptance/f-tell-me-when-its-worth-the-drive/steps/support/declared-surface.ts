// Driving a production surface that DISTILL has declared and DELIVER has not
// written yet, without turning the absence into a BROKEN run.
//
// The rule this file exists to keep: a scenario must fail at its own behaviour
// oracle, never at module loading. A top-level `import` of a module that is not
// on disk crashes at collection time and the run reports BROKEN, which proves
// nothing. So the load happens inside the acting step, the absence is captured
// as a string, and the Then step asserts the observable it always meant to
// assert, with the captured absence attached to the failure message.
//
// The consequence worth stating: these assertions do NOT go green the moment an
// empty module appears. An empty module yields an empty outcome, and an empty
// outcome still fails "sale exactamente un aviso". That is the difference
// between an oracle and a presence check.
//
// Paths named here are DISTILL's TypeScript rendering of the contract names the
// accepted architecture already uses: `decide_subscribe` and
// `plan_notifications` are named as pure-function contracts in
// application-architecture.md section 10 (via 07-write-path.md section 10's
// component table). The service worker seat handlers are named by no document
// at all: the cross-feature seam grants a structural seat only, so their home is
// a DELIVER decision inside that contract and is flagged in the requirement
// checklist rather than settled here.

import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const projectRoot = process.cwd();

/** The production surfaces slice-01's scenarios drive. */
export const DECLARED = {
  decideSubscribe: { path: 'src/push/decide-subscribe.ts', exportName: 'decideSubscribe' },
  planNotifications: { path: 'src/push/plan-notifications.ts', exportName: 'planNotifications' },
  planSendReactions: { path: 'src/push/plan-notifications.ts', exportName: 'planSendReactions' },
  handlePush: { path: 'src/push/notification-seat.ts', exportName: 'handlePush' },
  handleNotificationClick: {
    path: 'src/push/notification-seat.ts',
    exportName: 'handleNotificationClick',
  },
} as const;

export type DeclaredName = keyof typeof DECLARED;

export type SurfaceCall<T> = {
  /** The value the production surface returned, or null when it could not be reached. */
  readonly value: T | null;
  /** Plain-language account of why the surface could not be reached, or null. */
  readonly absence: string | null;
};

type AnyFn = (...args: readonly unknown[]) => unknown;

/**
 * Reach a declared production surface and call it. Never throws: an absent
 * module, a missing export, or a throwing implementation all come back as a
 * captured `absence`, so the acting step completes and the Then step owns the
 * failure.
 */
export async function callDeclared<T>(
  name: DeclaredName,
  ...args: readonly unknown[]
): Promise<SurfaceCall<T>> {
  const { path, exportName } = DECLARED[name];
  let module: Record<string, unknown>;
  try {
    module = (await import(pathToFileURL(join(projectRoot, path)).href)) as Record<string, unknown>;
  } catch (error) {
    return {
      value: null,
      absence: `todavía no existe ${path}, que es de donde tiene que salir ${exportName}() (${firstLine(error)})`,
    };
  }
  const candidate = module[exportName];
  if (typeof candidate !== 'function') {
    return {
      value: null,
      absence: `${path} existe pero no exporta ${exportName}()`,
    };
  }
  try {
    return { value: (await (candidate as AnyFn)(...args)) as T, absence: null };
  } catch (error) {
    return {
      value: null,
      absence: `${path} exporta ${exportName}() pero se cayó al llamarlo: ${firstLine(error)}`,
    };
  }
}

function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split('\n')[0] ?? message;
}

/** Join every captured absence into one clause for an assertion message. */
export function absenceContext(absences: readonly (string | null | undefined)[]): string {
  const named = absences.filter((a): a is string => typeof a === 'string' && a.length > 0);
  return named.length === 0 ? '' : `\n  lo que falta: ${[...new Set(named)].join('; ')}`;
}

/**
 * One assertion for a list of findings, so a scenario reports everything it
 * observed instead of only the first thing that broke.
 */
export function assertBehaviour(
  findings: readonly string[],
  context: string,
  absences: readonly (string | null | undefined)[] = [],
): void {
  if (findings.length === 0) return;
  const detail = findings.map((f) => `  - ${f}`).join('\n');
  throw new Error(`${detail}${absenceContext(absences)}\n\n  ${context}`);
}
