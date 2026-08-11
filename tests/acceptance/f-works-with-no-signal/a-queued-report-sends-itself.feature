@feature-f-works-with-no-signal
Feature: A queued report sends itself

  A report filed with no signal sends itself when the surfer walks back into
  coverage, with no tap and no reminder. The flush honours the settled
  contract word for word: it re-sends the committed record exactly as it was
  filed, never re-minting its name and never touching its times; a throttled
  or failing door leaves the entry queued and waiting politely, never showing
  the surfer a failure; any answer that counts as received deletes the entry;
  and a refusal with a reason is surfaced, kept, and never hammered. Signal
  is worst exactly where reports happen, so nothing on the phone ever decides
  a report "already went": the phone replays, and the site decides.

  The queue these scenarios flush is another feature's to create: capture and
  the durable commit belong to F-TELL-US-WHAT-YOU-SAW-COLD slice-01, so every
  Given here plants an already-committed record at the seam, exactly as
  capture would have left it. The database and store names in that seam are
  proposed, not settled — reconcile them against f-tell's queue module the
  moment it ships (steps/support/queue-seam.ts carries the loud version).

  Nothing here depends on Background Sync: its availability on iPhones is
  unverified, so every send must go out without any help the phone was not
  guaranteed to have.

  @slice-03 @walking_skeleton @driving_port @real-io @covers-R19 @covers-R23 @covers-R24 @covers-R27
  Scenario: A report filed with no signal sends itself when the signal comes back
    Given the phone will count the helper nudges the page sends
    And a surfer has read the home page with signal
    And a report is waiting on the phone because it was filed with no signal
    When the signal comes back
    Then the report reaches the site by itself, exactly as it was filed
    And the report is no longer waiting on the phone
    And the returned signal nudged the helper exactly once

  @slice-03 @driving_port @real-io @covers-R20 @covers-R25
  Scenario: A report waiting on a phone that never noticed the signal return still goes out
    Given a report is waiting on a phone that has never had the offline helper
    When the surfer opens the site with signal and the helper arrives
    Then the report reaches the site by itself, exactly as it was filed
    And the report is no longer waiting on the phone
    And it went out without any help the phone was not guaranteed to have

  @slice-03 @driving_port @real-io @error @covers-R22
  Scenario: A throttled door keeps the report waiting patiently, never as a failure
    Given a surfer has read the home page with signal
    And a report is waiting on the phone because it was filed with no signal
    And the site is answering sends with a throttled door
    When the signal comes back
    Then the report stays waiting on the phone
    And the phone does not hammer the throttled door
    And nothing the surfer sees reads as a failure

  @slice-03 @driving_port @real-io @error @covers-R24
  Scenario: A report the site refuses is kept, explained, and never hammered
    Given a surfer has read the home page with signal
    And a report is waiting on the phone because it was filed with no signal
    And the site is refusing sends with a reason
    When the signal comes back
    Then the surfer is shown the site's reason in plain Spanish
    And the label stays on the phone
    And the phone does not try the same send again by itself

  @slice-03 @driving_port @real-io @covers-R26 @covers-R38 @covers-R41
  Scenario: The sin señal page finally makes its second promise, and counts what is waiting
    Given a surfer has read the home page with signal
    And a report is waiting on the phone because it was filed with no signal
    When the signal drops and the surfer opens a spot they have never opened
    Then the sin señal page now promises that reports get saved
    And the page counts one waiting report in the settled words
    And nothing on the page is English, machine text or a raw timestamp

  @slice-03 @driving_port @real-io @covers-R27
  Scenario: Filed on the sand, the report is saved for the road
    Given a surfer has read the home page with signal
    And the surfer has opened the report screen for Playa Venao with signal
    When the signal drops and the surfer files their report anyway
    Then the screen says the report is saved for when the signal returns

  @slice-03 @driving_port @real-io @covers-R21 @covers-R27
  Scenario: Sent from the road
    Given a surfer filed their report at the beach with no signal
    When the signal comes back
    Then the report reaches the site by itself, exactly as it was filed
    And the report is no longer waiting on the phone
