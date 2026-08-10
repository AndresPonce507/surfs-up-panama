@feature-f-forecast-learns-from-the-beach
Feature: A bad month degrades to the day-zero product, never to silently wrong numbers

  Every month in this file is invented and no scenario claims the forecast
  learned anything. What is proven is the layer's own conscience: once a
  month, the corrections are re-judged on held-out mornings they never
  trained on, and if they lose, every one of them is switched off until a
  human looks. The judging itself may never shuffle time, because consecutive
  hours of one swell are near-duplicates and a shuffled split flatters
  whatever it judges. And the monthly file watches every hazard the design
  names, so drift is measured instead of assumed away. That file is for the
  operator only; no surfer ever sees it.

  These scenarios were authored ahead of their slice's turn on the owner's
  2026-08-10 instruction and are parked behind the scaffold skip-marker in
  steps/support/pending-slices.ts until slice-05 enters DELIVER.

  Background:
    Given the shipped trust settings, which exclude nobody

  @slice-05 @driving_port @in-memory @negative @error @covers-R34 @covers-R40
  Scenario: A month where the corrections lose on held-out mornings switches every one of them off until a human looks
    Given a correction that once passed every gate is on file for Playa Venao
    And ten weeks of mornings whose last two weeks turned against the correction
    When the monthly evaluation runs
    Then the evaluation finishes and reports the check it made
    And every correction on file now says applied false, until a human looks
    And the monthly file records that the corrections lost on the held-out mornings

  @slice-05 @driving_port @in-memory @covers-R34
  Scenario: A month where the corrections help leaves them standing, and says so
    Given a correction that once passed every gate is on file for Playa Venao
    And ten weeks of mornings that kept agreeing with the correction
    When the monthly evaluation runs
    Then the evaluation finishes and reports the check it made
    And the correction on file still says applied, because the held-out mornings sided with it
    And the monthly file records that the corrections earned their keep

  @slice-05 @driving_port @in-memory @security @negative @covers-R34
  Scenario Outline: Held-out mornings must stay forward of training, never shuffled with it
    Given the prepared source universe "<universe>"
    When its learning declarations are examined
    Then the examination <verdict> it over the rule that held-out mornings must stay forward of training

    Examples: a universe that must be refused
      | universe          | verdict |
      | cv-shuffled-folds | refuses |

    Examples: a universe that must be accepted
      | universe               | verdict |
      | cv-forward-time-blocks | accepts |

  @slice-05 @driving_port @in-memory @covers-R35
  Scenario: The monthly file watches every hazard the design names
    Given a correction that once passed every gate is on file for Playa Venao
    And ten weeks of mornings that kept agreeing with the correction
    And ninety days of published calls where mornings like the reported ones looked good and the unreported kind looked bad
    When the monthly evaluation runs
    Then the monthly file counts the mornings heard from at every kind of day, and how many were asked for
    And it states the ranking record within one person's own mornings and its distance from the pair target
    And it states the height error beside its two humble baselines, never as a headline
    And it states the floor human agreement puts under any model

  @slice-05 @driving_port @in-memory @negative @covers-R35
  Scenario: A confidence level that does not predict correctness is named for removal
    Given a correction that once passed every gate is on file for Playa Venao
    And ten weeks of mornings where the confident calls kept being wrong and the hesitant ones kept being right
    When the monthly evaluation runs
    Then the monthly file names the confidence term that failed its own check, the spread term first in line

  @slice-05 @driving_port @in-memory @negative @covers-R35
  Scenario: A spot still mostly pooled after eighty mornings is flagged as a misconfiguration
    Given a correction on file whose eighty mornings are still mostly pooled away
    When the monthly evaluation runs
    Then the monthly file flags that spot's pooling as a misconfiguration alarm
