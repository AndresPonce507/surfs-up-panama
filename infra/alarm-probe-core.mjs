// F-BILL slice-04 pure core: turns one recorded read of the live account's
// dead-man's switches into the alarm-probe report and its exit code. No AWS
// call, no process access; the shell (alarm-probe.mjs) owns IO.
//
// What this command may claim, and what it may never claim:
//
// The evidence it reads is a REAL production incident of 2026-08-11..13, not
// the synthetic drill slice-04 originally planned. Nobody disabled a schedule.
// The incident is strictly better evidence than a drill, but it is different
// evidence, so the report must say what actually happened:
//
//   - Both ALARM transitions fired on the alarm's FIRST evaluation, about a
//     minute after the alarm was created, with no recent datapoints at all.
//     So the elapsed time from a last successful run to the ALARM is NOT
//     measurable from this history. The 2 to 3 hour detection floor is proven
//     STRUCTURALLY and live, from the deployed alarm's 2 evaluation periods of
//     3600 s with missing data treated as breaching. Never by stopwatch.
//   - Delivery is proven to the subscribed endpoint, with no failed delivery
//     anywhere in the window. Nobody opened the email. The report may quote
//     the state reason text that populates the body, and may never claim the
//     body was read.
//
// One phrase is forbidden in the output on purpose: the epic's rejected
// promise about hearing within a single hour. The settled design refuses that
// number and this evidence measured no detection time at all, so the report
// states the honest floor and leaves the rejected number unsaid rather than
// arguing with it. An acceptance scenario asserts its absence.

// The switches that must be proven alive. Deliberately a constant and NOT
// derived from the capture: a watch list read out of the file being judged
// would silently shrink when an alarm goes missing, and the probe could never
// go red on the one failure that matters most.
export const watchedDeadMansSwitches = [
  'surfs-up-panama-dead-mans-switch',
  'surfs-up-panama-build-dead-mans-switch',
];

const PENDING = 'PendingConfirmation';
const HOUR_MS = 3600_000;

// Parsing an offset-bearing stamp is arithmetic on the string, not a read of
// the ambient clock, so the core stays pure and its output is identical on
// every machine and in every zone.
function instant(value) {
  const ms = Date.parse(String(value ?? ''));
  return Number.isFinite(ms) ? ms : undefined;
}

// Takes the epoch milliseconds the cycle already resolved, never the raw
// offset-bearing string: re-parsing a number would silently yield NaN and
// print "undefined" into the one field an operator lines up against a run.
function utcStamp(ms) {
  return Number.isFinite(ms) ? new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z') : 'unknown';
}

function hourOf(value) {
  const ms = instant(value);
  return ms === undefined ? undefined : Math.floor(ms / HOUR_MS) * HOUR_MS;
}

function alarmNamed(capture, name) {
  return (capture?.alarms?.MetricAlarms ?? []).find((entry) => entry?.AlarmName === name);
}

function historyOf(capture, name) {
  return capture?.history?.[name]?.AlarmHistoryItems ?? [];
}

function raisedAt(items) {
  return items.filter((item) => /to ALARM/i.test(String(item?.HistorySummary ?? '')))
    .map((item) => instant(item?.Timestamp))
    .filter((ms) => ms !== undefined)
    .sort((a, b) => a - b)[0];
}

function closedAt(items, after) {
  return items.filter((item) => /to OK/i.test(String(item?.HistorySummary ?? '')))
    .map((item) => instant(item?.Timestamp))
    .filter((ms) => ms !== undefined && (after === undefined || ms >= after))
    .sort((a, b) => a - b)[0];
}

// The state reason CloudWatch puts in the mail body, read off the transition
// itself rather than off the alarm's current state: the current state only
// ever describes the LAST transition, so reading it would lose the ALARM text
// the moment the OK lands, which is precisely when this report is written.
function reasonAt(items, pattern) {
  for (const item of items) {
    if (!pattern.test(String(item?.HistorySummary ?? ''))) continue;
    try {
      const reason = JSON.parse(String(item?.HistoryData ?? '')).newState?.stateReason;
      if (typeof reason === 'string' && reason.length > 0) return reason;
    } catch { /* an unparsable entry is treated as no reason, and reported as such */ }
  }
  return undefined;
}

// "Both switches fired on their first evaluation, with nothing behind them" is
// the claim that keeps this report honest about NOT having measured a
// detection time, so it is proven from the history rather than asserted.
//
// Two things must both hold on the ALARM transition: the alarm came from
// INSUFFICIENT_DATA (so no earlier evaluation had ever completed), and the
// evaluation saw an EMPTY recentDatapoints list (so no successful run sat
// behind it). Read `newState.stateReasonData`, never `oldState`'s: oldState
// carries only {stateValue, stateReason} and has no stateReasonData at all, so
// `oldState.stateReasonData?.recentDatapoints ?? []` would read as empty on a
// field that is simply absent. That is a false pass on absence rather than
// proof of emptiness, and this whole slice exists to refuse exactly that move.
function firstEvaluationProof(items) {
  for (const item of items) {
    if (!/to ALARM/i.test(String(item?.HistorySummary ?? ''))) continue;
    try {
      const data = JSON.parse(String(item?.HistoryData ?? ''));
      const recent = data?.newState?.stateReasonData?.recentDatapoints;
      return {
        fromInsufficientData: data?.oldState?.stateValue === 'INSUFFICIENT_DATA',
        noRunBehind: Array.isArray(recent) && recent.length === 0,
      };
    } catch { return { fromInsufficientData: false, noRunBehind: false }; }
  }
  return { fromInsufficientData: false, noRunBehind: false };
}

function deliveredHours(capture) {
  return new Set((capture?.notificationsDelivered?.Datapoints ?? [])
    .filter((point) => Number(point?.Sum) > 0)
    .map((point) => hourOf(point?.Timestamp))
    .filter((hour) => hour !== undefined));
}

function failedDeliveries(capture) {
  return (capture?.notificationsFailed?.Datapoints ?? []).filter((point) => Number(point?.Sum) > 0);
}

function subscriptions(capture) {
  return capture?.topicSubscriptions?.Subscriptions ?? [];
}

// One switch's cycle, reduced to the facts the report and the rejections both
// need. Faults are collected rather than thrown so a half-proven capture is
// rejected naming EVERY half it leaves open, not merely the first one found.
function readCycle(capture, name) {
  const alarm = alarmNamed(capture, name);
  if (alarm === undefined) {
    return { name, faults: [`the watched switch ${name} is missing from the capture, so nothing proves it is deployed at all`] };
  }
  const items = historyOf(capture, name);
  const faults = [];
  const raised = raisedAt(items);
  const closed = closedAt(items, raised);
  if (raised === undefined) faults.push(`${name} has no ALARM transition, so nothing proves the switch ever fired`);
  if (closed === undefined) faults.push(`${name} has no OK transition closing its ALARM, so the cycle is half proven: an alarm that never cleared tells the site owner nothing arrived to say the ingest recovered`);
  if ((alarm.AlarmActions ?? []).length === 0) faults.push(`${name} declares no ALARM action, so a raised alarm would mail nobody`);
  if ((alarm.OKActions ?? []).length === 0) faults.push(`${name} declares no OK action, so the all-clear would mail nobody and the site owner would never learn the ingest recovered`);
  return {
    name,
    faults,
    metric: alarm.MetricName,
    periods: alarm.EvaluationPeriods,
    periodSeconds: alarm.Period,
    missingData: String(alarm.TreatMissingData ?? ''),
    raised,
    closed,
    ...firstEvaluationProof(items),
    alarmReason: reasonAt(items, /to ALARM/i),
    okReason: reasonAt(items, /to OK/i),
  };
}

// The floor is DERIVED from what is deployed, never spelled as a literal, so
// that an alarm re-tuned to different periods reports its real floor instead
// of repeating a sentence somebody once typed. Detection lands between
// `periods` and `periods + 1` whole periods: the run that stops is already
// part-way through the first period when it goes missing.
function detectionFloor(cycles) {
  const configs = cycles.map((cycle) => ({ periods: cycle.periods, seconds: cycle.periodSeconds }))
    .filter((config) => Number.isFinite(config.periods) && Number.isFinite(config.seconds));
  if (configs.length === 0) return undefined;
  const [first] = configs;
  if (configs.some((config) => config.periods !== first.periods || config.seconds !== first.seconds)) return undefined;
  const periodHours = first.seconds / 3600;
  return {
    periods: first.periods,
    periodHours,
    low: first.periods * periodHours,
    high: (first.periods + 1) * periodHours,
  };
}

function plainHours(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

export function evaluateAlarmProbe({ capture, watchList = watchedDeadMansSwitches } = {}) {
  const region = capture?.region ?? 'unknown region';
  const cycles = watchList.map((name) => readCycle(capture, name));
  const faults = cycles.flatMap((cycle) => cycle.faults);

  const subs = subscriptions(capture);
  const confirmed = subs.filter((entry) => typeof entry?.SubscriptionArn === 'string' && entry.SubscriptionArn !== PENDING);
  const pending = subs.filter((entry) => entry?.SubscriptionArn === PENDING);
  if (subs.length === 0) faults.push('the alarm topic has no subscription at all, so every one of these transitions mailed nobody');
  // Fires on ANY pending endpoint, not merely when every endpoint is pending.
  // A topic carrying one confirmed and one unconfirmed address still has a
  // human who believes they subscribed and receives nothing, and reporting
  // that topic as wholly confirmed is the same overclaim in miniature.
  if (pending.length > 0) faults.push(`the alarm topic holds ${pending.length} unconfirmed subscription (${PENDING}) alongside ${confirmed.length} confirmed, and an unconfirmed endpoint receives nothing, so somebody who believes they are subscribed is being mailed nothing`);

  // The provenance sentence is the load-bearing honesty claim of this whole
  // slice, so it is QUOTED from the capture, never asserted by this file. A
  // hardcoded "real production incident" would print the same words over a
  // capture of a staged drill, which is precisely the substitution this report
  // exists to disclose.
  const provenance = typeof capture?.provenance === 'string' ? capture.provenance.trim() : '';
  if (provenance.length === 0) faults.push('the capture states no provenance, so nothing distinguishes a real outage from a staged drill and the report may not claim either');

  const failed = failedDeliveries(capture);
  if (failed.length > 0) faults.push(`the window records a failed delivery (${failed.length} of them), so the chain from alarm to inbox is broken even though the alarms themselves behaved`);

  const delivered = deliveredHours(capture);
  const uncovered = cycles.flatMap((cycle) => [
    { label: `${cycle.name} ALARM`, at: cycle.raised },
    { label: `${cycle.name} OK`, at: cycle.closed },
  ]).filter((change) => change.at !== undefined && !delivered.has(Math.floor(change.at / HOUR_MS) * HOUR_MS));
  if (uncovered.length > 0) faults.push(`no delivery was recorded in the hour of ${uncovered.map((change) => change.label).join(', ')}, so that state change cannot be shown to have mailed anyone`);

  if (faults.length > 0) {
    return {
      exitCode: 1,
      lines: [
        'alarm probe: REJECTED. This capture does not prove the dead-man\'s switches are alive.',
        ...faults.map((fault) => `  - ${fault}`),
        '  Half a cycle proves nothing. Recapture once a real ALARM has been closed by a real OK.',
      ],
    };
  }

  const topic = subs.map((entry) => entry?.TopicArn).find((arn) => typeof arn === 'string') ?? 'the alarm topic';
  const floor = detectionFloor(cycles);
  const lines = [
    `alarm probe: PROVEN. Both dead-man's switches completed an ALARM then OK cycle in ${region}.`,
    '',
    'What raised each switch, and what closed it. All instants UTC:',
  ];
  for (const cycle of cycles) {
    lines.push(
      `  ${cycle.name} (metric ${cycle.metric})`,
      `    ALARM ${utcStamp(cycle.raised)} UTC  ->  OK ${utcStamp(cycle.closed)} UTC`,
      `    the ALARM mail carried: ${cycle.alarmReason}`,
      `    the OK mail carried:    ${cycle.okReason}`,
    );
  }
  const proven = cycles.filter((cycle) => cycle.fromInsufficientData && cycle.noRunBehind);
  lines.push(
    '',
    floor === undefined
      ? 'The detection floor cannot be derived: the switches do not agree on their evaluation periods, so no single floor describes them both.'
      : `The detection floor, derived from what is deployed rather than timed with a stopwatch: ${floor.periods} consecutive ${plainHours(floor.periodHours)} h periods with missing data treated as ${cycles[0]?.missingData}, so a stall surfaces between ${plainHours(floor.low)} and ${plainHours(floor.high)} hours after the last good run. That is the settled ${plainHours(floor.low)} to ${plainHours(floor.high)} hour floor, and it is the honest number.`,
    'Breaching handling is the load-bearing word: a metric filter with no matching log line reports no datapoint at all, not a zero, so default handling would hold the alarm green forever exactly when everything is dead.',
    proven.length === cycles.length
      ? `Every switch here raised ALARM on its first evaluation, coming from INSUFFICIENT_DATA with an empty recent-datapoint list, which means no successful run ever sat behind it (${proven.map((cycle) => cycle.name).join('; ')}). The wait from a last good run to the mail was therefore never measured here, and this report does not present the floor as if it had been.`
      : `Not every switch can be shown to have fired on its first evaluation, so this report claims nothing about how long detection took: proven for ${proven.length} of ${cycles.length}. The wait from a last good run to the mail was never measured here either way.`,
    '',
    `Mail: a delivery recorded in the hour of every state change above, over ${topic}, and no delivery failed anywhere in the captured window. That topic holds ${confirmed.length} endpoint whose subscription is confirmed and none left pending, so the mail had somewhere real to land.`,
    'The mail body itself was never opened, so its exact wording stays unproven; the state reasons quoted above are the text CloudWatch puts in it.',
    '',
    `Provenance, quoted from the capture rather than asserted by this command: "${provenance}"`,
  );
  return { exitCode: 0, lines };
}
