// The write-path circuit breaker (07-write-path.md section 7.2, control 0.6,
// and system-architecture.md guardrail 8's $18 action line). Trip: set the
// reserved concurrency of exactly the four write functions to 0, turning the
// flood into free front-door 429s, then schedule a one-shot self-invoke that
// restores the declared values 6 hours later. This function must NEVER name
// an ingest function: a billing flood must never be able to stop the
// prediction log.

import { LambdaClient, PutFunctionConcurrencyCommand } from '@aws-sdk/client-lambda';
import { SchedulerClient, CreateScheduleCommand } from '@aws-sdk/client-scheduler';

const lambdaClient = new LambdaClient({});
const schedulerClient = new SchedulerClient({});

const writeFunctions = JSON.parse(process.env.WRITE_FUNCTIONS ?? '{}');

async function setConcurrency(functionName, reserved) {
  await lambdaClient.send(new PutFunctionConcurrencyCommand({
    FunctionName: functionName,
    ReservedConcurrentExecutions: reserved,
  }));
}

export const handler = async (event) => {
  if (event?.action === 'restore') {
    for (const [functionName, reserved] of Object.entries(writeFunctions)) {
      await setConcurrency(functionName, reserved);
      console.log(JSON.stringify({ event: 'breaker.restore', function: functionName, reserved }));
    }
    return { restored: Object.keys(writeFunctions) };
  }

  for (const functionName of Object.keys(writeFunctions)) {
    await setConcurrency(functionName, 0);
    console.log(JSON.stringify({ event: 'breaker.trip', function: functionName }));
  }

  const restoreAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 19);
  await schedulerClient.send(new CreateScheduleCommand({
    Name: `${process.env.RESTORE_SCHEDULE_PREFIX}-${Date.now()}`,
    ScheduleExpression: `at(${restoreAt})`,
    FlexibleTimeWindow: { Mode: 'OFF' },
    State: 'ENABLED',
    ActionAfterCompletion: 'DELETE',
    Target: {
      Arn: process.env.SELF_ARN,
      RoleArn: process.env.RESTORE_ROLE_ARN,
      Input: JSON.stringify({ action: 'restore' }),
      RetryPolicy: { MaximumRetryAttempts: 2 },
    },
  }));
  console.log(JSON.stringify({ event: 'breaker.restore-scheduled', at: restoreAt }));
  return { tripped: Object.keys(writeFunctions), restoreAt };
};
