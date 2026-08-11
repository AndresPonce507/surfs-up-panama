@feature-f-works-with-no-signal
Feature: It sends once, and only once

  The queued report sends itself once, and only once. The phone never trusts
  itself to know what already went: it replays every waiting record and lets
  the site's own memory of the report's name decide. A retry that raced an
  earlier success is answered with the original reveal, rendered the same,
  counted nowhere a second time; and the nastiest branch of all — the site
  heard the report but the answer died on the way back — ends with the surfer
  seeing one report counted, ever.

  What "answered exactly like the first time" can observe today is the
  idempotent ack: the entry leaves the queue, nothing reads as a failure, and
  the site holds exactly one record. The word-for-word rendering of the
  original reveal on screen two becomes assertable when
  F-TELL-US-WHAT-YOU-SAW-COLD slice-04 ships the reveal renderer; that
  strengthening is an amendment owed to that moment, recorded in the slice-04
  roadmap step, not a test that broke.

  @slice-04 @driving_port @real-io @error @covers-R29
  Scenario: The phone never decides a report already went; it asks, and the site answers
    Given a surfer has read the home page with signal
    And two reports are waiting on the phone because they were filed with no signal
    And the site already has one of them from an earlier send
    When the signal comes back
    Then the site is asked about both reports
    And the site still holds each report exactly once
    And no report is waiting on the phone afterwards

  @slice-04 @driving_port @real-io @error @covers-R28 @covers-R38
  Scenario: A report the site already had is answered exactly like the first time
    Given a surfer has read the home page with signal
    And a report is waiting on the phone because it was filed with no signal
    And the site already has that report from an earlier send
    When the signal comes back
    Then the phone accepts the site's first answer as the answer
    And the report is no longer waiting on the phone
    And nothing the surfer sees reads as a failure

  @slice-04 @driving_port @real-io @error @covers-R28 @covers-R30
  Scenario: An answer lost on the way back never becomes a second report
    Given a surfer has read the home page with signal
    And a report is waiting on the phone because it was filed with no signal
    And the site will hear the first send but the answer will never reach the phone
    When the signal comes back
    And the signal comes back again later
    Then the site was asked twice and answered the second ask with its first answer
    And the site still holds each report exactly once
    And no report is waiting on the phone afterwards
    And nothing the surfer sees reads as a failure
