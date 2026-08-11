// Slice-03's page-ownership contract.  It drives the production build in a
// real browser and only listens to browser traffic.  It does not provide a
// route, intercept a response, or call a write handler itself.

import { Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

import { observedWriteRequest, observedWriteResponse, queuedReports, scenarioState, textBeforeReportAnswer, visibleText } from './support/world';

Then('the phone keeps one saved label while it waits for an answer', async function (this: object) {
  const reports = await queuedReports(scenarioState(this));
  assert.equal(
    reports.length,
    1,
    `WHAT: Mandar did not leave one durable label on the phone (found ${reports.length}). HOW: commit the label before its journey begins.`,
  );
});

Then('the page itself asks for anonymous permission and sends that exact saved label', async function (this: object) {
  const state = scenarioState(this);
  const reports = await queuedReports(state);
  const saved = reports[0]?.row;
  assert.ok(saved, 'WHAT: no saved label exists to send. HOW: commit it before asking the server.');

  await observedWriteRequest(state, '/api/report');
  const mintIndex = state.writeAttempts.findIndex((attempt) => new URL(attempt.url).pathname === '/api/mint');
  const reportIndex = state.writeAttempts.findIndex((attempt) => new URL(attempt.url).pathname === '/api/report');
  const mint = mintIndex < 0 ? undefined : state.writeAttempts[mintIndex];
  const report = reportIndex < 0 ? undefined : state.writeAttempts[reportIndex];
  assert.ok(
    report,
    'WHAT: the page did not send the saved label. WHY: the report island still ends at the on-phone queue, so no surfer can receive a real server answer. HOW: make the production page submit its own saved record after the background permission succeeds.',
  );
  state.reportTextBeforeResponse = await textBeforeReportAnswer(state);
  assert.ok(
    mint,
    'WHAT: the page did not ask for anonymous permission. WHY: a test helper cannot carry a surfer\'s label to the server. HOW: let the production page mint invisibly before its first report attempt.',
  );
  assert.ok(
    mintIndex < reportIndex,
    'WHAT: the page sent the label before asking for anonymous permission. HOW: ask for the permission first, then send the unchanged saved label with it.',
  );
  assert.equal(report.method, 'POST', 'WHAT: the saved label did not leave through its one-way send. HOW: use the settled write action.');
  assert.equal(
    report.body,
    JSON.stringify(saved),
    'WHAT: the page changed the saved label before it left the phone. HOW: replay the durable record byte-for-byte; its identity and observation time must not be reminted.',
  );
  assert.ok(
    report.headers['x-surf-credential'],
    'WHAT: the page sent the label without its anonymous permission. HOW: pass the permission obtained by the page with the saved report.',
  );
});

Then("the phone receives the saved label's private answer before it can show the outcome", async function (this: object) {
  const state = scenarioState(this);
  const saved = (await queuedReports(state))[0]?.row;
  assert.ok(saved, 'WHAT: no saved label exists to match with its answer. HOW: keep the label before its journey starts.');
  const response = await observedWriteResponse(state, '/api/report');
  assert.ok(
    response,
    'WHAT: the phone received no answer for its saved label. HOW: let the production page wait for the local report service before revealing an outcome.',
  );
  assert.equal(response.status, 200, 'WHAT: the saved label was not accepted. HOW: keep it unchanged and show the Spanish refusal from the report service.');
  const body = await response.body;
  assert.ok(body, 'WHAT: the report service returned no receipt. HOW: return the saved label\'s answer before revealing it.');
  const receipt = JSON.parse(body) as { readonly outcome?: unknown; readonly report_id?: unknown; readonly predicted?: unknown };
  assert.equal(receipt.report_id, saved.report_id, 'WHAT: the answer belongs to a different saved label. HOW: reveal only the receipt matching the submitted identity.');
  assert.equal(receipt.outcome, 'no_snapshot', 'WHAT: the local report answer did not preserve the honest no-snapshot outcome. HOW: reveal the service result without inventing a forecast.');
  assert.equal(receipt.predicted, null, 'WHAT: the local report answer invented a forecast. HOW: preserve the private no-snapshot reveal.');
});

Then('the surfer sees their saved report arrived only after its matching answer', async function (this: object) {
  const state = scenarioState(this);
  const before = state.reportTextBeforeResponse;
  assert.ok(before !== null, 'WHAT: the page showed an arrival without sending the saved label. HOW: wait for the report service before changing the arrival state.');
  const arrivalWords = /llegó|recibido|recibimos/i;
  assert.ok(!arrivalWords.test(before), 'WHAT: the page showed arrival before the report service answered. HOW: change the arrival state only from the matching receipt.');
  const deadline = Date.now() + 2_000;
  let after = await visibleText(state);
  while (!arrivalWords.test(after) && Date.now() < deadline) {
    await new Promise<void>((resolvePause) => { setTimeout(resolvePause, 25); });
    after = await visibleText(state);
  }
  assert.ok(
    arrivalWords.test(after),
    `WHAT: the surfer cannot see that the saved report arrived after its answer. Screen text: ${JSON.stringify(after.slice(0, 500))}. HOW: render the matching arrival state after the report receipt.`,
  );
});

Then('the surfer sees neither an account step nor our forecast before a server answer', async function (this: object) {
  const text = await visibleText(scenarioState(this));
  for (const forbidden of ['Inicia sesión', 'Crear cuenta', 'pronóstico', 'Dijimos', 'score']) {
    assert.ok(!text.includes(forbidden), `WHAT: the waiting screen shows ${JSON.stringify(forbidden)}. HOW: preserve the anonymous, forecast-free journey until the server answers.`);
  }
});
