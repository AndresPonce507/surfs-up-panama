// Slice-03's page-ownership contract.  It drives the production build in a
// real browser and only listens to browser traffic.  It does not provide a
// route, intercept a response, or call a write handler itself.

import { Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

import { queuedReports, scenarioState, visibleText } from './support/world';

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

  const mintIndex = state.writeAttempts.findIndex((attempt) => new URL(attempt.url).pathname === '/api/mint');
  const reportIndex = state.writeAttempts.findIndex((attempt) => new URL(attempt.url).pathname === '/api/report');
  const mint = mintIndex < 0 ? undefined : state.writeAttempts[mintIndex];
  const report = reportIndex < 0 ? undefined : state.writeAttempts[reportIndex];
  assert.ok(
    report,
    'WHAT: the page did not send the saved label. WHY: the report island still ends at the on-phone queue, so no surfer can receive a real server answer. HOW: make the production page submit its own saved record after the background permission succeeds.',
  );
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

Then('the surfer sees neither an account step nor our forecast before a server answer', async function (this: object) {
  const text = await visibleText(scenarioState(this));
  for (const forbidden of ['Inicia sesión', 'Crear cuenta', 'pronóstico', 'Dijimos', 'score']) {
    assert.ok(!text.includes(forbidden), `WHAT: the waiting screen shows ${JSON.stringify(forbidden)}. HOW: preserve the anonymous, forecast-free journey until the server answers.`);
  }
});
