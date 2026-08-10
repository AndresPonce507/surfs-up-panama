@feature-f-forecast-learns-from-the-beach
Feature: A brand-new spot rides its parents instead of inventing its own number

  Every spot and every morning in this file is invented, and no scenario
  claims the forecast learned anything. What is proven is the pooling ladder's
  declared laws: a spot with almost no evidence leans on the spots around it,
  a Caribbean spot can never borrow a Pacific bias at any weight because the
  basin is a hard wall and not a soft preference, spots of one break type
  start pooling among themselves only once three of them have earned their own
  corrections, and once eight spots have proven themselves genuinely
  different, the pooling steps aside on its own, down to a permanent floor.

  These scenarios were authored ahead of their slice's turn on the owner's
  2026-08-10 instruction and are parked behind the scaffold skip-marker in
  steps/support/pending-slices.ts until slice-03 enters DELIVER.

  Background:
    Given the shipped trust settings, which exclude nobody

  @slice-03 @driving_port @in-memory @negative @covers-R28 @covers-R29 @covers-R40
  Scenario: A brand-new spot with two reports rides its parents instead of inventing its own number
    Given a Pacific beach spot where 22 mornings from 7 people came in 0.22 m bigger than forecast
    And a brand-new Pacific beach spot where 2 mornings from 2 people came in 0.6 m bigger than forecast
    When the nightly fit runs across those spots
    Then the brand-new spot gets no correction applied, recording its 2 mornings from 2 people
    And the difference stored for the brand-new spot sits closer to its neighbours' than to its own two mornings

  @slice-03 @driving_port @in-memory @negative @security @covers-R28
  Scenario: A Caribbean spot can never borrow a Pacific bias, at any weight
    Given a Pacific beach spot where 22 mornings from 7 people came in 0.22 m bigger than forecast
    And a Caribbean beach spot where 6 mornings from 3 people saw exactly what was forecast
    When the nightly fit runs across those spots, once with the Pacific mornings present and once without them
    Then everything stored for the Caribbean spot is byte-identical between the two runs

  @slice-03 @driving_port @in-memory @property @covers-R29
  Scenario: One loud rating moves a brand-new spot by only a sliver of itself
    Given a quiet Pacific beach spot whose 22 mornings from 7 people saw exactly what was forecast
    And any single loud morning at a brand-new spot in the same region
    When the nightly fit runs across those spots for each loud morning
    Then the brand-new spot's stored difference never moves by more than a third of what the loud morning claims

  @slice-03 @driving_port @in-memory @covers-R30
  Scenario: Once eight spots have proven themselves different, pooling steps aside on its own
    Given eight Pacific beach spots that each earned an applied correction, with wildly different differences
    When the nightly fit runs across those spots
    Then each of the eight spots keeps its applied correction
    And each spot's stored difference sits nearer its own mornings than the hand-set prior would have left it
    And no spot's stored difference reaches its own mornings exactly, because a permanent floor keeps some pooling

  @slice-03 @driving_port @in-memory @covers-R30
  Scenario: Three proven spots of one break type start pooling among themselves, with no code change
    Given three Pacific beach spots that each earned an applied correction near 0.3 m under forecast
    And three Pacific reef spots that each earned an applied correction near 0.25 m over forecast
    And a brand-new Pacific beach spot with 2 mornings whose people saw exactly what was forecast
    When the nightly fit runs across those spots
    Then the brand-new beach spot's stored difference sits with the beach spots, not with the region-wide average

  @slice-03 @driving_port @in-memory @negative @covers-R30
  Scenario: Two proven spots of a break type are not yet a family, and the region keeps carrying them
    Given two Pacific beach spots that each earned an applied correction near 0.3 m under forecast
    And three Pacific reef spots that each earned an applied correction near 0.25 m over forecast
    And a brand-new Pacific beach spot with 2 mornings whose people saw exactly what was forecast
    When the nightly fit runs across those spots
    Then the brand-new beach spot's stored difference sits with the region-wide average, not with the beach spots alone
