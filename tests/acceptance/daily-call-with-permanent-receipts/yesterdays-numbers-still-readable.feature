@feature-daily-call-with-permanent-receipts
Feature: Yesterday's numbers, still readable, unchanged

  The next morning, yesterday's published call is still readable, exactly as
  published. Receipts are append-only: every build leaves its own record, no
  later build can rewrite an earlier one, and the record of what the site
  said for a day is its dawn build, the one surfers acted on.

  Background:
    Given the spot "Playa Venao" and its scoring constants

  @slice-01 @driving_port @in-memory @contract-shape:bounded-change @covers-R4 @covers-R7
  Scenario: What we said yesterday re-reads today, byte for byte
    Given yesterday's dawn build published a call
    When today's dawn build publishes a new call
    Then yesterday's published call re-reads byte-identical
    And today's call is its own new record

  @slice-01 @driving_port @in-memory @negative @contract-shape:bounded-change @covers-R7
  Scenario: A later build never rewrites what the dawn build said
    Given today's dawn build published a call
    And the swell picked up during the morning
    When the mid-morning build publishes an updated call
    Then each build's record exists under its own build stamp
    And the dawn build's record is byte-identical to what it published
