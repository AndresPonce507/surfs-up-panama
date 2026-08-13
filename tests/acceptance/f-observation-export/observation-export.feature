@feature-f-observation-export
Feature: The night's accepted reports leave the write store as an immutable log

  After a UTC day closes, every report the write store accepted that day leaves
  as one flat line in the observation log, partitioned by the tile its beach
  sits in. The nightly fit and the scorecard read that log and nothing else.
  It is written once and never rewritten, so a field dropped on the way out is
  dropped for good.

  Background:
    Given the launch seed places Playa Venao and Santa Catalina
    And the nightly observation export is due at 00:30 UTC on 2026-08-13

  @slice-01 @step-01-01 @driving_port @in-memory @covers-R1 @covers-R5 @covers-R12
  Scenario: Every report the store accepted yesterday leaves as one flat line
    Given the write store holds two reports accepted on 2026-08-12
    When the nightly observation export runs
    Then the observation log carries one line per report accepted that day
    And every line carries the beach, the device, both timings and the surfer's answers at its top level
    And no line names a person and no line carries a photo

  @slice-01 @step-01-01 @driving_port @in-memory @covers-R2
  Scenario: The call a surfer was shown rides out whole, and no call rides out as nothing
    Given the write store holds one report accepted on 2026-08-12 whose surfer was shown a live call
    And the write store holds one report accepted on 2026-08-12 whose surfer was shown no call
    When the nightly observation export runs
    Then the shown call rides out with all five of its parts, none added and none dropped
    And the report that was shown no call rides out saying so, never guessing one

  @slice-01 @step-01-01 @driving_port @in-memory @covers-R3
  Scenario: Each line lands in the tile its own beach sits in
    Given the write store holds one report accepted on 2026-08-12 at each of the two beaches
    When the nightly observation export runs
    Then the log holds one object per beach tile, named for the day that closed
    And each beach's line is inside its own beach's tile object

  @slice-01 @step-01-01 @driving_port @in-memory @error @covers-R10
  Scenario: Nothing but an accepted report ever becomes a line
    Given the write store also holds a credential, a device quota and a spot counter
    And the write store holds one report accepted on 2026-08-12
    And the write store holds a half-written report item missing its record
    When the nightly observation export runs
    Then the export completes without refusing the night
    And only the accepted report became a line

  @slice-01 @step-01-01 @driving_port @in-memory @covers-R11
  Scenario: A report received after the day closed waits for the next run
    Given the write store holds one report accepted on 2026-08-12
    And the write store holds one report accepted at 00:10 UTC on 2026-08-13
    When the nightly observation export runs
    Then the export names 2026-08-12 as the day it closed
    And only the report received on that day became a line
