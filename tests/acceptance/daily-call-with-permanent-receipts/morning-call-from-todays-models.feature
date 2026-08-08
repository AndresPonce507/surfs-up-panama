@feature-daily-call-with-permanent-receipts
Feature: Today's call, computed from this morning's models

  A surfer opens the site and sees a real spot with today's score and its
  call in Spanish, computed from this morning's actual model data. Before
  anything is scored, the morning's model opinions are snapshotted
  permanently, because a missed snapshot is gone forever and the archive
  is the one thing in this product that cannot be recreated.

  Background:
    Given the spot "Playa Venao" and its scoring constants
    And the four wave models reported their morning opinions for it
    And the wind and tide sources reported their morning readings

  @slice-01 @driving_port @in-memory @contract-shape:bounded-change @covers-R2
  Scenario: The morning run snapshots what every wave model said
    When the hourly ingest run completes
    Then the prediction log holds one row per model per forecast hour
    And every row carries its natural key of spot, model, model run and forecast hour
    And every row records exactly what that model said, unchanged

  @slice-01 @driving_port @in-memory @negative @contract-shape:bounded-change @covers-R3
  Scenario: A crash downstream of the snapshot never destroys the snapshot
    Given the hourly ingest run completes
    When the scoring build crashes before publishing anything
    Then every snapshotted row is still readable, unchanged

  @slice-01 @driving_port @in-memory @negative @contract-shape:bounded-change @covers-R4
  Scenario: A repeated run cannot rewrite history
    Given the hourly ingest run completes
    When the same run fires a second time
    Then the repeat is acknowledged as a duplicate, not an error
    And the prediction log re-reads byte-identical

  @slice-01 @driving_port @in-memory @contract-shape:pure-function @covers-R1 @covers-R5 @covers-R8
  Scenario: The published call is the physics of the blended members
    Given the hourly ingest run completes
    When the build publishes the morning call
    Then the published call for six in the evening carries a score of 80
    And its size band is waist to chest
    And its confidence level is low, from the models' own disagreement
    And the call names size as what held the day back

  @slice-01 @driving_port @in-memory @negative @contract-shape:pure-function @covers-R6
  Scenario: With no correction file the learning term changes nothing
    Given no learned correction exists for the spot
    And the hourly ingest run completes
    When the build publishes the morning call
    Then the published score is exactly the physics score, with no bias applied
    And the record shows the correction gate closed with no file

  @slice-01 @driving_port @in-memory @negative @contract-shape:bounded-change @covers-R9
  Scenario: One dark wave model never blanks the morning
    Given the wave model "dwd_gwam" went dark this morning
    When the hourly ingest run completes
    And the build publishes the morning call
    Then the prediction log holds no rows for the dark model this cycle
    And the spot still gets a score from the three remaining models

  @slice-01 @driving_port @in-memory @negative @contract-shape:bounded-change @covers-R9
  Scenario: A morning with no usable data keeps yesterday's call instead of inventing one
    Given yesterday's dawn build published a call
    And every wave model went dark this morning
    When the build attempts to publish
    Then it refuses to publish
    And yesterday's published call keeps serving, untouched

  @slice-01 @driving_port @in-memory @negative @contract-shape:pure-function @covers-R10
  Scenario: A dead wind source is named, never papered over
    Given the wind source went dark this morning
    When the hourly ingest run completes
    And the build publishes the morning call
    Then the spot still gets a score, from swell and tide alone
    And the record shows wind as absent, not as a number

  @slice-01 @driving_port @in-memory @negative @contract-shape:bounded-change @covers-R11
  Scenario: A masked grid cell is never averaged into the call
    Given the wave model "meteofrance_wave" reported the fake flat sea for this spot
    When the hourly ingest run completes
    And the build publishes the morning call
    Then that model's rows are flagged as land masked in the log
    And the call is blended from the three real opinions only
