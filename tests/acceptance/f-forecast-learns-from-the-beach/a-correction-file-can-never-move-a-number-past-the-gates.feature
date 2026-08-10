@feature-f-forecast-learns-from-the-beach
Feature: A correction file, present, corrupt or absent, can never move a number past the gates

  The apply side is where this layer could silently corrupt every number the
  product publishes. Every correction record in this file is a hand-built test
  input in the exact shape the nightly fit stores; nothing here is evidence
  that the forecast has learned anything, and no scenario claims it has. What
  is proven is the fence: the builder consumes the file through its shipped
  seam, re-checks the publication gates at read time so a forged or stale file
  is stopped by the same arithmetic the fit enforced, clamps the worst move a
  file can order, treats an unreadable file as an absent one out loud, and
  returns to day zero the moment the file is gone.

  These scenarios were authored ahead of their slice's turn on the owner's
  2026-08-10 instruction and are parked behind the scaffold skip-marker in
  steps/support/pending-slices.ts until slice-02 enters DELIVER.

  Background:
    Given Playa Venao, its scoring constants and this morning's model opinions
    And the shipped trust settings, which exclude nobody
    And the morning call that was published before anyone had reported anything

  @slice-02 @driving_port @in-memory @covers-R20
  Scenario: A stored correction that passed every gate finally moves the number a surfer reads
    Given a stored correction that passed every gate, earned when the waves kept coming in bigger than forecast
    When the morning is published again with that correction in place
    Then the waves a surfer reads for Playa Venao are bigger than day zero published
    And the score a surfer reads is humbler than day zero published, because the mornings said it ran generous
    And the newest archived call records the exact score move that was live and the gate that admitted it

  @slice-02 @driving_port @in-memory @negative @error @covers-R20 @covers-R21
  Scenario: A correction the gates refused is carried in silence and changes nothing
    Given a stored correction the gates refused, on 9 mornings from 3 people
    When the morning is published again with that correction in place
    Then the waves and score a surfer reads are exactly what day zero published
    And the newest archived call records no move at all and names too few mornings as the reason

  @slice-02 @driving_port @in-memory @negative @security @covers-R21
  Scenario: A hand-forged file claiming to be applied on six mornings is stopped by the builder's own gates
    Given a hand-forged correction claiming to be applied on 6 mornings from 3 people
    When the morning is published again with that correction in place
    Then the waves and score a surfer reads are exactly what day zero published
    And the newest archived call records no move at all and names too few mornings as the reason

  @slice-02 @driving_port @in-memory @negative @security @covers-R21
  Scenario: A hand-forged file whose difference is buried in its own noise is stopped the same way
    Given a hand-forged correction claiming to be applied though its difference is buried in its own noise
    When the morning is published again with that correction in place
    Then the waves and score a surfer reads are exactly what day zero published
    And the newest archived call records no move at all and names a difference too small to tell from noise

  @slice-02 @driving_port @in-memory @negative @covers-R22
  Scenario: However big the stored move, the published height never moves past forty percent of the forecast
    Given a stored correction that passed every gate but orders a height move far beyond its own limit
    When the morning is published again with that correction in place
    Then the waves a surfer reads for Playa Venao are bigger than day zero published
    And the height a surfer reads moved by no more than forty percent of what day zero published

  @slice-02 @driving_port @in-memory @negative @covers-R23
  Scenario: However big the stored move, the published score never moves more than twelve points
    Given a stored correction that passed every gate but orders a score move far beyond its own limit
    When the morning is published again with that correction in place
    Then the score a surfer reads moved, and by no more than twelve points

  @slice-02 @driving_port @in-memory @negative @error @covers-R24
  Scenario: An unreadable correction file is read as absent, and the reader says why
    Given the stored correction for Playa Venao is replaced by unreadable bytes
    When the stored correction is read the way the builder reads it
    Then the reader treats the file as absent and says why
    And reading it yields no correction at all, so nothing a surfer reads can move on it

  @slice-02 @driving_port @in-memory @negative @error @covers-R25
  Scenario: A score move stated in any unit but the points a surfer sees is refused by name
    Given a stored correction whose score move is stated in "q_units"
    When the stored correction is read the way the builder reads it
    Then the reader refuses the foreign unit by name and yields no correction at all

  @slice-02 @driving_port @in-memory @covers-R26 @covers-R27 @covers-R40
  Scenario: Deleting every correction file returns the product to day zero on the next build
    Given a stored correction that passed every gate, earned when the waves kept coming in bigger than forecast
    And the morning was already published again with that correction in place
    When every correction is deleted and the morning is published once more
    Then the build that had the correction in place had moved the number
    And the waves and score a surfer reads are exactly what day zero published
    And the newest archived call records no move at all and says no correction file existed
