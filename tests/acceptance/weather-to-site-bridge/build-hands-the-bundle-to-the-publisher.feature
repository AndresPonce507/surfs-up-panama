@feature-weather-to-site-bridge
Feature: Build hands the bundle to the publisher

  The hour Build finishes an honest cycle it does not stop at the numbers. It
  writes down that it built, then hands the publisher the exact build it just
  finished and the exact bundle it just wrote, and it waits for the answer
  before its hour ends. That handover is the only way into the publisher, so
  it happens once an hour and never twice.

  Everything else about the handover is refusal discipline. A cycle with
  nothing worth publishing never wakes the publisher at all. Neither does a
  cycle whose fresh pages could not be confirmed to be really public. A
  publisher that cannot be reached is written down and left alone until the
  next hour, because the next hour republishes everything anyway, and a
  failed handover never erases a build that really happened. A publisher that
  refuses is not a broken handover: it already said so itself, in its own
  words, in its own log.

  These scenarios drive Build's own hourly cycle through its production entry
  point, against readings held in memory. The publisher itself, the public
  check of the fresh pages and the hour's instant are the only stand-ins.

  @slice-02 @driving_port @in-memory
  Scenario: Build hands the publisher the build it just finished
    Given Build has a fresh hour's worth of readings for the Pacific
    When Build runs its hourly cycle
    Then the publisher is asked exactly once, for the build Build just finished and the bundle it just wrote
    And Build waited for the publisher before its hour ended
    And the day's log claims the build succeeded, exactly once

  @slice-02 @driving_port @in-memory @error
  Scenario: An hour with nothing worth publishing never wakes the publisher
    Given Build already handed this morning's bundle to the publisher
    And this hour there is not one usable reading anywhere
    When Build runs its hourly cycle
    Then the publisher was asked for the morning's bundle only, never for this hour's
    And the hour's log says the build refused, and never claims success

  @slice-02 @driving_port @in-memory @error
  Scenario: Pages that cannot be confirmed public are never handed over
    Given Build already handed this morning's bundle to the publisher
    But this hour's fresh pages never turn up publicly
    When Build runs its hourly cycle
    Then the publisher was asked for the morning's bundle only, never for this hour's
    And Build's hour ends without claiming anything at all

  @slice-02 @driving_port @in-memory @error
  Scenario: A publisher that cannot be reached is written down, never retried, and never erases the build
    Given Build has a fresh hour's worth of readings for the Pacific
    But the publisher cannot be reached this hour
    When Build runs its hourly cycle
    Then the publisher was asked once and never asked again
    And the hour's log writes down the failed handover, naming the build and what went wrong
    And the day's log still claims the build itself succeeded
    And Build still answers that it published

  @slice-02 @driving_port @in-memory
  Scenario: A publisher that refuses spoke for itself, so Build records no failed handover
    Given Build has a fresh hour's worth of readings for the Pacific
    But the publisher answers that it published nothing this hour
    When Build runs its hourly cycle
    Then the publisher is asked exactly once, for the build Build just finished and the bundle it just wrote
    And the hour's log writes down no failed handover
    And the day's log claims the build succeeded, exactly once
