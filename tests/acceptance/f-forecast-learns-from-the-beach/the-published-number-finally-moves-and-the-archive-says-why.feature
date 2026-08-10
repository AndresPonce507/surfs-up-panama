@feature-f-forecast-learns-from-the-beach
Feature: The published number finally moves toward what people saw, and the archive says why

  This is the epic promise, proven here on invented mornings only: the
  machinery moves the number end to end, from reported mornings through the
  nightly fit through the shipped builder to what a surfer reads. No scenario
  claims the forecast learned anything real — the slice these scenarios
  belong to cannot ship until at least ten real pairs from at least five
  different trust-eligible people exist at a spot, and zero real reports
  exist today. What is provable now is the wiring and the honesty: the
  number moves in the direction the mornings pointed, every thinner-evidence
  morning publishes exactly the day-zero seed physics, the archived call
  records which correction was live, and neither job can touch anything but
  its own shelves.

  These scenarios were authored ahead of their slice's turn on the owner's
  2026-08-10 instruction and are parked behind the scaffold skip-marker in
  steps/support/pending-slices.ts until slice-07 enters DELIVER.

  Background:
    Given Playa Venao, its scoring constants and this morning's model opinions
    And the shipped trust settings, which exclude nobody
    And the morning call that was published before anyone had reported anything

  @slice-07 @driving_port @in-memory @covers-R38 @covers-R39 @covers-R40
  Scenario: Once enough different people's mornings clear the gates, the number a surfer reads moves toward what they saw
    Given 22 mornings at Playa Venao were reported by 7 people who saw the waves come in 0.22 m bigger than forecast
    And the nightly fit already ran on those mornings
    When the morning is published again after the fit
    Then the waves a surfer reads for Playa Venao are bigger than day zero published
    And the newest archived call carries the exact correction the fit stored and the gate that admitted it
    And the day-zero archive still reads exactly as it was written, because receipts never change

  @slice-07 @driving_port @in-memory @negative @covers-R38 @covers-R39
  Scenario: Below the gate, day zero publishes exactly, and the archive says why
    Given 9 mornings at Playa Venao were reported by 3 people who saw the waves come in 0.22 m bigger than forecast
    And the nightly fit already ran on those mornings
    When the morning is published again after the fit
    Then the waves and score a surfer reads are exactly what day zero published
    And the newest archived call records no move at all and names too few mornings as the reason

  @slice-07 @driving_port @in-memory @security @covers-R37
  Scenario: Neither learning job can touch anything but its own shelves
    Given 22 mornings at Playa Venao were reported by 7 people who saw the waves come in 0.22 m bigger than forecast
    When the nightly fit and the monthly evaluation both run
    Then both jobs finished and reported what they did
    And nothing outside the learning shelves changed: not the predictions, not the observations, not the published archive, not the trust settings
