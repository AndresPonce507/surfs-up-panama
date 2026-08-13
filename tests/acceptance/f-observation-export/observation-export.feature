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

  @slice-01 @step-01-02 @driving_port @in-memory @covers-R6 @covers-R5
  Scenario: The night's coordination signals leave in the same pass as its rows
    Given the write store holds a young-cohort pile-on at Playa Venao late on 2026-08-11 local time
    And the write store holds one ordinary report at Santa Catalina on 2026-08-12 local time
    And the write store holds the mint ledger those credentials came from
    When the nightly observation export runs
    Then the night leaves one signals file beside its rows
    And the signals say how many devices reported at each beach and how old their credentials were
    And the signals say how alike the sizes were, and say nothing where too few devices reported
    And the signals say how fast the reports arrived and how many arrived in a burst
    And the signals count the mints each source host made over the trailing week
    And the source hash rides in the signals file and on no line of the log

  @slice-01 @step-01-02 @driving_port @in-memory @covers-R6
  Scenario: A bucket the file cut short says so, and names the window it was really computed over
    Given the write store holds a young-cohort pile-on at Playa Venao late on 2026-08-11 local time
    And the write store holds one ordinary report at Santa Catalina on 2026-08-12 local time
    And the write store holds the mint ledger those credentials came from
    When the nightly observation export runs
    Then the signals group each beach by its own local day, never by the UTC day of the file
    And every bucket names the UTC window it was really computed over
    And every bucket the file cut short says it is incomplete

  @slice-01 @step-01-02 @driving_port @in-memory @covers-R4
  Scenario: Running the same night again writes nothing new and clobbers nothing
    Given the write store holds a young-cohort pile-on at Playa Venao late on 2026-08-11 local time
    And the write store holds one ordinary report at Santa Catalina on 2026-08-12 local time
    And the write store holds the mint ledger those credentials came from
    When the nightly observation export runs
    And that same night gains one more report and the export runs again
    Then the second run recomputed the night and offered it under the same names
    And every object still holds byte for byte what the first run wrote
    And the second run left no object of its own behind

  @slice-01 @step-01-02 @driving_port @real-io @covers-R9a
  Scenario: What lands under a .gz key is really gzip, and the signals file really is not
    Given the night writes through the house storage adapter onto a real disk
    And the write store holds one report accepted on 2026-08-12
    When the nightly observation export runs
    Then the bytes under the beach's .gz key begin with the gzip magic number
    And unzipping those bytes gives back exactly the lines the run wrote
    And the signals file is plain readable JSON, not gzip wearing a .json name
