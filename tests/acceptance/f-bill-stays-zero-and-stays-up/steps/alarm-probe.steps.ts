// F-BILL slice-04 drives only the production-owned alarm-probe command entry
// (`runAlarmProbe`) through its documented `--input` port. No AWS call and no
// credential is made from a test.
//
// The positive scenarios read the committed capture at
// infra/evidence/alarm-probe-capture-2026-08-13.json read-only. That capture
// is a REAL production outage of 2026-08-11 to 13, not the synthetic drill
// slice-04 originally planned: no schedule was ever disabled. The negative
// scenarios mutate a temporary COPY of it, never the committed evidence, and
// a scenario asserts the committed file is byte-identical afterwards.
//
// Three claims the capture cannot support, and which the report must refuse:
//   - a measured detection time. Both switches raised ALARM on their first
//     evaluation with recentDatapoints empty, so no last-good-run-to-mail
//     duration exists in this history. The 2 to 3 hour floor is read off the
//     deployed switch (2 evaluation periods of 3600 s, missing data
//     breaching), never off a stopwatch.
//   - a read email. Delivery to the subscribed endpoint is proven and no
//     delivery failed; nobody opened the message.
//   - a staged drill. This was an outage.

import { After, Then, When, type DataTable } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { runAlarmProbe } from '../../../../infra/alarm-probe.mjs';

type AlarmProbeWorld = object;
type ObservedResult = Readonly<{ exitCode: number; output: string }>;
type RejectedCapture = Readonly<{ result: ObservedResult; mustName: string }>;

const EVIDENCE = fileURLToPath(new URL('../../../../infra/evidence/alarm-probe-capture-2026-08-13.json', import.meta.url));

const INGEST_SWITCH = 'surfs-up-panama-dead-mans-switch';
const BUILD_SWITCH = 'surfs-up-panama-build-dead-mans-switch';

// The ALARM state reason CloudWatch wrote into both mails, quoted from the
// capture. This is the text an operator woken at 6am actually reads.
const ALARM_STATE_REASON = 'Threshold Crossed: no datapoints were received for 2 periods and 2 missing datapoints were treated as [Breaching].';

// Rejections that concern one named switch must say which one.
const NAMES_THE_INGEST_SWITCH = new Set([
  'an ALARM that no OK ever closed',
  'a switch with no OK action to send the all-clear',
]);

class CapturingOutput {
  readonly lines: string[] = [];
  log(line: string): void { this.lines.push(line); }
  text(): string { return this.lines.join('\n'); }
}

const results = new WeakMap<AlarmProbeWorld, ObservedResult>();
const rejections = new WeakMap<AlarmProbeWorld, ReadonlyMap<string, RejectedCapture>>();
const scratchRoots = new WeakMap<AlarmProbeWorld, string[]>();
const evidenceSnapshots = new WeakMap<AlarmProbeWorld, string>();

function readEvidence(): string {
  assert.ok(existsSync(EVIDENCE), `WHAT: the recorded alarm-probe capture is absent. WHY: slice-04 has no other proof that the switches ever fired. HOW: restore ${EVIDENCE}.`);
  return readFileSync(EVIDENCE, 'utf8');
}

function runProbeAgainst(path: string): ObservedResult {
  const output = new CapturingOutput();
  const exitCode = runAlarmProbe({ argv: ['--input', path], output });
  return { exitCode, output: output.text() };
}

function scratchFile(world: AlarmProbeWorld, capture: unknown): string {
  const root = mkdtempSync(join(tmpdir(), 'surfs-up-alarm-probe-'));
  const roots = scratchRoots.get(world) ?? [];
  roots.push(root);
  scratchRoots.set(world, roots);
  const path = join(root, 'capture.json');
  writeFileSync(path, JSON.stringify(capture, null, 2), 'utf8');
  return path;
}

function observe(world: AlarmProbeWorld, result: ObservedResult): void { results.set(world, result); }

function observed(world: AlarmProbeWorld): ObservedResult {
  const result = results.get(world);
  assert.ok(result, 'WHAT: no alarm-probe result was captured. HOW: invoke the production command entry before observing it.');
  return result;
}

function assertIncludes(output: string, expected: string, why: string): void {
  assert.ok(output.toLowerCase().includes(expected.toLowerCase()), `WHAT: the produced alarm-probe report omits ${JSON.stringify(expected)}. WHY: ${why}.\n${output}`);
}

function requiredTableValue(row: Readonly<Record<string, string | undefined>>, column: string): string {
  const value = row[column];
  assert.ok(typeof value === 'string' && value.length > 0, `WHAT: coupled acceptance data omits ${JSON.stringify(column)}.`);
  return value;
}

// A parsed scratch copy of the capture, deliberately untyped: the negative
// rows exist to build captures the real shape forbids, so a strict type here
// would only be fought.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MutableCapture = any;

function findAlarm(capture: MutableCapture, name: string): MutableCapture {
  const alarm = (capture?.alarms?.MetricAlarms ?? []).find((entry: MutableCapture) => entry?.AlarmName === name);
  assert.ok(alarm, `WHAT: the recorded capture has no alarm named ${name}. HOW: recapture the evidence.`);
  return alarm;
}

// Each mutation must leave a capture that a real account could actually have
// produced. A half-edited capture (an ALARM history entry removed while the
// alarm still reports StateValue OK) would let an implementation that reads
// only the current state pass a negative it should fail, and a probe that
// cannot go red proves nothing.
function breakCapture(capture: MutableCapture, witness: string): void {
  if (witness === 'an ALARM that no OK ever closed') {
    const alarm = findAlarm(capture, INGEST_SWITCH);
    const items = capture.history?.[INGEST_SWITCH]?.AlarmHistoryItems ?? [];
    const remaining = items.filter((item: MutableCapture) => !/to OK/i.test(String(item?.HistorySummary ?? '')));
    assert.equal(remaining.length, items.length - 1, `WHAT: the no-OK mutation did not remove exactly one closing transition for ${INGEST_SWITCH}.`);
    const raised = remaining.find((item: MutableCapture) => /to ALARM/i.test(String(item?.HistorySummary ?? '')));
    assert.ok(raised, `WHAT: the capture has no ALARM transition for ${INGEST_SWITCH} to leave open.`);
    capture.history[INGEST_SWITCH].AlarmHistoryItems = remaining;
    alarm.StateValue = 'ALARM';
    alarm.StateReason = ALARM_STATE_REASON;
    alarm.StateReasonData = JSON.stringify(JSON.parse(String(raised.HistoryData)).newState.stateReasonData);
    alarm.StateUpdatedTimestamp = raised.Timestamp;
    alarm.StateTransitionedTimestamp = raised.Timestamp;
    return;
  }
  if (witness === 'a switch with no OK action to send the all-clear') {
    const alarm = findAlarm(capture, INGEST_SWITCH);
    assert.ok((alarm.OKActions ?? []).length > 0, `WHAT: ${INGEST_SWITCH} already has no OK action, so this mutation proves nothing.`);
    alarm.OKActions = [];
    return;
  }
  if (witness === 'a subscription that was never confirmed') {
    const subscriptions = capture?.topicSubscriptions?.Subscriptions ?? [];
    assert.equal(subscriptions.length, 1, 'WHAT: the capture does not hold exactly one subscription to leave unconfirmed.');
    assert.notEqual(subscriptions[0].SubscriptionArn, 'PendingConfirmation', 'WHAT: the recorded subscription is already unconfirmed, so this mutation proves nothing.');
    subscriptions[0].SubscriptionArn = 'PendingConfirmation';
    return;
  }
  if (witness === 'a delivery to the subscription that failed') {
    const datapoints = capture?.notificationsFailed?.Datapoints ?? [];
    assert.ok(datapoints.length > 0, 'WHAT: the capture holds no delivery-failure readings to break.');
    assert.ok(datapoints.every((point: MutableCapture) => Number(point?.Sum) === 0), 'WHAT: the recorded window already contains a failed delivery, so this mutation proves nothing.');
    datapoints[0].Sum = 1;
    return;
  }
  if (witness === 'a watched switch missing from the capture') {
    const before = capture.alarms.MetricAlarms.length;
    capture.alarms.MetricAlarms = capture.alarms.MetricAlarms.filter((entry: MutableCapture) => entry?.AlarmName !== BUILD_SWITCH);
    assert.equal(capture.alarms.MetricAlarms.length, before - 1, `WHAT: ${BUILD_SWITCH} was not present to remove.`);
    delete capture.history[BUILD_SWITCH];
    return;
  }
  assert.fail(`unknown incomplete-capture witness: ${witness}`);
}

When('the site owner reads the recorded alarm-probe capture of the live incident', function (this: AlarmProbeWorld) {
  evidenceSnapshots.set(this, readEvidence());
  observe(this, runProbeAgainst(EVIDENCE));
});

Then('the alarm probe finishes successfully', function (this: AlarmProbeWorld) {
  const result = observed(this);
  assert.equal(result.exitCode, 0, `WHAT: the alarm probe exited ${result.exitCode} against the complete recorded capture. HOW: accept evidence that does prove the cycle.\n${result.output}`);
});

Then('the produced report names each dead-man\'s switch, the instant it raised ALARM, the instant OK closed it, and the region', function (this: AlarmProbeWorld) {
  const output = observed(this).output;
  assertIncludes(output, INGEST_SWITCH, 'the report must name the switch that watches the ingest, not a bare success');
  assertIncludes(output, BUILD_SWITCH, 'the report must name the switch that watches the publication, not only the ingest one');
  assertIncludes(output, '2026-08-10T02:56:25', 'the report must carry the instant the ingest switch raised ALARM');
  assertIncludes(output, '2026-08-13T00:18:56', 'the report must carry the instant OK closed the ingest switch');
  assertIncludes(output, '2026-08-11T18:17:58', 'the report must carry the instant the build switch raised ALARM');
  assertIncludes(output, '2026-08-13T06:23:58', 'the report must carry the instant OK closed the build switch');
  assertIncludes(output, 'UTC', 'instants must be stamped in one stated zone, or an operator cannot line them up against a run');
  assertIncludes(output, 'us-east-1', 'the mail names the region and so must the report that stands in for it');
});

Then('the produced report quotes the state reason that filled each ALARM mail and each OK mail', function (this: AlarmProbeWorld) {
  const output = observed(this).output;
  assertIncludes(output, 'no datapoints were received for 2 periods', 'the ALARM mail body is this reason; without quoting it the report cannot stand in for the mail');
  assertIncludes(output, 'treated as [Breaching]', 'the reason must show that absence, not a low count, is what raised the ALARM');
  assertIncludes(output, 'was not less than the threshold', 'the OK mail body is this reason; the all-clear must be as legible as the alarm');
});

Then('the produced report names the one confirmed subscription on the alarm topic', function (this: AlarmProbeWorld) {
  const output = observed(this).output;
  assertIncludes(output, 'surfs-up-panama-alarms', 'the report must name the topic the mail left by');
  // Deliberately not the needle "confirmed subscription": the negative row's
  // rejection says "unconfirmed subscription", which contains that phrase, so
  // the two needles would overlap and neither test would catch a report that
  // confused them.
  assertIncludes(output, 'subscription is confirmed', 'an unconfirmed subscription delivers nothing, so the report must state that this one is confirmed');
});

Then('the produced report reads the detection floor off the deployed switch: 2 consecutive 1 h periods with missing data treated as breaching', function (this: AlarmProbeWorld) {
  const output = observed(this).output;
  assertIncludes(output, '2 consecutive 1 h period', 'the floor is derived from the deployed evaluation periods, so the report must show them');
  assertIncludes(output, 'breaching', 'without breaching handling a missing datapoint holds the alarm green forever, exactly when everything is dead');
  assertIncludes(output, '2 to 3 hour', 'the report must state the honest detection floor the design settled on');
});

Then('the produced report says both switches raised ALARM on their first evaluation with no run behind them, so the wait from a last good run to the mail was never measured here', function (this: AlarmProbeWorld) {
  const output = observed(this).output;
  assertIncludes(output, 'first evaluation', 'both switches fired on absence from birth, which is why no elapsed time exists in this history');
  assertIncludes(output, 'never measured', 'the report must refuse a detection time it did not observe, rather than presenting the floor as a measurement');
});

Then('the produced report never promises the site owner hears about a stall within the hour', function (this: AlarmProbeWorld) {
  const output = observed(this).output;
  assert.ok(!output.toLowerCase().includes('within the hour'), `WHAT: the report promised "within the hour". WHY: the settled design refuses that number and this evidence measured no detection time at all.\n${output}`);
});

Then('the produced report says a delivery was recorded in the hour of every state change and that no delivery failed in the window', function (this: AlarmProbeWorld) {
  const output = observed(this).output;
  assertIncludes(output, 'delivery recorded', 'the report must show the mail left the topic, not merely that the alarm changed state');
  assertIncludes(output, 'every state change', 'one delivery somewhere in the window proves nothing about the other three transitions');
  assertIncludes(output, 'no delivery failed', 'a failed delivery is the silent way this whole chain breaks');
});

Then('the produced report says the mail body was never opened, so its wording stays unproven', function (this: AlarmProbeWorld) {
  const output = observed(this).output;
  assertIncludes(output, 'never opened', 'nobody inspected the message; the report must say so instead of implying an operator read it');
});

Then('the produced report says the cycle came from a real production incident, never from a staged drill', function (this: AlarmProbeWorld) {
  const output = observed(this).output;
  assertIncludes(output, 'real production incident', 'the planned drill never happened; the report must name the evidence it actually has');
});

Then('the produced report says no ingest schedule was disabled or re-enabled to produce it', function (this: AlarmProbeWorld) {
  const output = observed(this).output;
  assertIncludes(output, 'no schedule was disabled', 'the slice promised a disable-and-restore probe, and the report must not let a reader assume one was run');
});

When('the site owner checks each incomplete alarm-probe capture', function (this: AlarmProbeWorld, table: DataTable) {
  const source = readEvidence();
  evidenceSnapshots.set(this, source);
  const found = new Map<string, RejectedCapture>();
  for (const row of table.hashes()) {
    const witness = requiredTableValue(row, 'witness');
    const mustName = requiredTableValue(row, 'the rejection must name');
    const capture = JSON.parse(source);
    breakCapture(capture, witness);
    found.set(witness, { result: runProbeAgainst(scratchFile(this, capture)), mustName });
  }
  rejections.set(this, found);
});

Then('the recorded evidence capture is left unchanged', function (this: AlarmProbeWorld) {
  const before = evidenceSnapshots.get(this);
  assert.ok(before, 'WHAT: no evidence snapshot exists. HOW: capture it before breaking a copy.');
  assert.equal(readEvidence(), before, `WHAT: the committed alarm-probe capture changed. WHY: the live incident cannot be recaptured, so a scenario may break only a temporary copy. HOW: mutate the scratch copy, never ${EVIDENCE}.`);
});

Then('each incomplete capture is rejected naming exactly what it leaves unproven', function (this: AlarmProbeWorld) {
  const found = rejections.get(this);
  assert.ok(found, 'WHAT: no incomplete-capture outcomes were captured.');
  for (const [witness, { result, mustName }] of found) {
    assert.notEqual(result.exitCode, 0, `WHAT: ${witness} was accepted as proof the switches are alive. WHY: half a cycle proves nothing, and a probe that cannot go red proves nothing either. HOW: reject it.\n${result.output}`);
    assertIncludes(result.output, mustName, `the rejection must name what ${witness} leaves unproven, never a generic "capture invalid"`);
    if (NAMES_THE_INGEST_SWITCH.has(witness)) assertIncludes(result.output, INGEST_SWITCH, `the rejection for ${witness} must name which switch is unproven`);
  }
});

After(function (this: AlarmProbeWorld) {
  for (const root of scratchRoots.get(this) ?? []) rmSync(root, { recursive: true, force: true });
});
