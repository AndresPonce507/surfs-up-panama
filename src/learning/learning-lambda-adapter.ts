// Lambda composition boundary for the scheduled learning runtime.
//
// The core takes a store and a clock as ports. Only this adapter knows about
// Lambda's environment, the real S3 adapter, or the scheduled event shape.

import { S3Client } from '@aws-sdk/client-s3';

import { runMonthlyEvaluationOnce, type MonthlyEvaluationStore } from './evaluate';
import { runLearningFitOnce, type LearningStore } from './fit';
import { S3LearningStore } from './learning-s3-store';
import type { Clock } from '../pipeline/ports';

const NIGHTLY_FIT_JOB = 'nightly-fit';
const MONTHLY_EVALUATION_JOB = 'monthly-evaluation';

export type LearningRuntimeEvent = Readonly<{
  job?: unknown;
}>;

export type LearningRuntimeStore = LearningStore & MonthlyEvaluationStore;

export type LearningRuntimeDeps = Readonly<{
  store: LearningRuntimeStore;
  clock: Clock;
}>;

export type LearningRuntimeOutcome = Readonly<{
  job: typeof NIGHTLY_FIT_JOB | typeof MONTHLY_EVALUATION_JOB;
  completed: boolean;
  no_op: boolean;
  corrections_written: number;
  metrics_written: boolean;
}>;

/**
 * Driving port for an EventBridge Scheduler tick. It turns the core's
 * explicit outcome into a small operational record without creating a public
 * surface or claiming a correction the gates did not write.
 */
export function createLearningRuntimeHandler(
  deps: LearningRuntimeDeps,
): (event: LearningRuntimeEvent) => Promise<LearningRuntimeOutcome> {
  return async (event) => {
    if (event.job === NIGHTLY_FIT_JOB) {
      const outcome = await runLearningFitOnce(deps);
      return {
        job: NIGHTLY_FIT_JOB,
        completed: outcome.completed,
        no_op: outcome.corrections_written === 0,
        corrections_written: outcome.corrections_written,
        metrics_written: false,
      };
    }

    if (event.job === MONTHLY_EVALUATION_JOB) {
      const outcome = await runMonthlyEvaluationOnce(deps);
      return {
        job: MONTHLY_EVALUATION_JOB,
        completed: outcome.completed,
        no_op: false,
        corrections_written: 0,
        metrics_written: true,
      };
    }

    throw new Error(
      'learning runtime refused: schedule job must be nightly-fit or monthly-evaluation',
    );
  };
}

/** The deployed scheduled-handler entrypoint. */
export async function handler(
  event: LearningRuntimeEvent = {},
): Promise<LearningRuntimeOutcome> {
  const outcome = await createLearningRuntimeHandler({
    store: new S3LearningStore(new S3Client({}), requiredEnvironment('SITE_BUCKET')),
    clock: { now: () => new Date() },
  })(event);
  console.log(JSON.stringify(outcome));
  return outcome;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(
      `learning runtime refused: ${name} is required to read immutable logs and write only its fenced projection`,
    );
  }
  return value;
}
