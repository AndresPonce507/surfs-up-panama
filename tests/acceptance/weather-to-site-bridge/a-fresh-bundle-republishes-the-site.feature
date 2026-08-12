@feature-weather-to-site-bridge
Feature: A fresh bundle republishes the site

  The hour Build finishes a fresh bundle, the publisher turns it into the
  freshly published site with no human in the loop: it merges the bundle into
  the durable archive of record, renders the site from that merged surface,
  and uploads every page together with its directory address, each upload
  marked so a stale copy can never linger. Every guard the manual release
  chain has stays armed. A bundle for the wrong civil day, a rendered site
  carrying another origin's receipt, and a bundle that is not the build the
  publisher was asked for each refuse with a named reason, upload nothing,
  and leave the previous pages serving. Success is never claimed unless every
  single upload finished.

  These scenarios drive the real publish port end to end: the real surface
  merge, the real two-day contract, the real civil-day rule against an
  injected instant, and the real checked-in upload walk with its alias
  double-write and origin-receipt guard. Only the object store, the clock,
  the upload pipe and the site render are stand-ins the steps control; the
  real render inside the container is the ARM64 smoke's burden, never this
  suite's to fake a pass from.

  @slice-01 @walking_skeleton @driving_port @real-io
  Scenario: A fresh bundle for today republishes every page with no human in the loop
    Given Build has just written a fresh bundle for today's Panama civil day
    When the publisher runs its cycle for that bundle
    Then every page is uploaded and each one also lands at its directory address
    And every upload carries the freshness mark that keeps a stale copy from lingering
    And the durable archive now holds the merged surface the site was rendered from
    And the cycle answers that it published
    And the day's log claims success exactly once

  @slice-01 @driving_port @error
  Scenario: A bundle for the wrong civil day refuses by name and touches nothing
    Given the durable archive already holds yesterday's published surface
    And Build hands the publisher a bundle for a civil day that is not today's
    When the publisher runs its cycle for that bundle
    Then the cycle refuses naming both civil days
    And not one object was uploaded
    And the durable archive is byte-identical to what it held before

  @slice-01 @driving_port @error
  Scenario: A site rendered for another origin refuses before anything is uploaded
    Given Build has just written a fresh bundle for today's Panama civil day
    But the rendered site carries a receipt for the preview origin, not production
    When the publisher runs its cycle for that bundle
    Then the cycle refuses naming the origin the site was really rendered for
    And the refusal happened before a single upload

  @slice-01 @driving_port @error
  Scenario: A bundle that is not the build the publisher was asked for refuses before any work
    Given Build has just written a fresh bundle for today's Panama civil day
    But the publisher is invoked for a build the bundle does not carry
    When the publisher runs its cycle for that bundle
    Then the cycle refuses because the bundle is not the build it was asked to publish
    And the site was never rendered
    And not one object was uploaded
    And the durable archive is byte-identical to what it held before

  @slice-01 @driving_port
  Scenario: A publish cycle only ever adds, it never lists and never deletes
    Given the publisher has completed a cycle for a fresh bundle
    Then nothing in the whole cycle ever listed or deleted anything, anywhere

  @slice-01 @driving_port
  Scenario: Dawn receipts survive the day's later cycles, and a first run seeds honestly
    Given the durable archive does not exist yet
    When the publisher runs a first-ever dawn cycle
    Then the archive seeds from that dawn call alone without inventing history
    When the publisher runs the day's next hourly cycle
    Then the archive still holds the dawn receipt beside the fresh hourly surface

  @slice-01 @driving_port @error
  Scenario: A publish that could not finish never claims success
    Given Build has just written a fresh bundle for today's Panama civil day
    But one upload in the middle of the batch will fail
    When the publisher runs its cycle for that bundle
    Then the cycle does not claim it published
    And the day's log never claims success
    And the refusal names the upload that broke
