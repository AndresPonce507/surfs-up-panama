@feature-f-forecast-learns-from-the-beach
Feature: One voice counts once, and a habit is measured and subtracted rather than trusted or banned

  Every morning in this file is invented and no scenario claims the forecast
  learned anything. What is proven is the weighing room: one person shouting
  five times counts once, a wild claim on a well-observed morning is pulled to
  the day's fence before it is weighed, chronic disagreement is down-weighted
  but never silenced, a newcomer starts at full voice, mornings of a kind
  nobody usually reports count for more so the quiet days stop being outvoted,
  a morning the site asked for carries no rarity bonus, a habit of calling it
  big is measured across two beaches and mostly subtracted, and a discovered
  campaign is excised by a human-owned incident file that names reporters,
  never individual reports.

  These scenarios were authored ahead of their slice's turn on the owner's
  2026-08-10 instruction and are parked behind the scaffold skip-marker in
  steps/support/pending-slices.ts until slice-04 enters DELIVER.

  Background:
    Given Playa Venao, its scoring constants and this morning's model opinions
    And the shipped trust settings, which exclude nobody

  @slice-04 @driving_port @in-memory @negative @covers-R31 @covers-R40
  Scenario: Five reports from one session count exactly once
    Given 22 mornings at Playa Venao were reported by 7 people who saw the waves come in 0.22 m bigger than forecast
    When the nightly fit runs on those mornings, and again with one person's every report repeated five times in the same session
    Then both runs stored byte-identical corrections, because a session counts once however loudly it repeats itself

  @slice-04 @driving_port @in-memory @negative @covers-R31
  Scenario: A wild claim on a well-observed morning is pulled to the day's fence, not believed
    Given 12 mornings at Playa Venao were reported by 6 people who saw the waves come in 0.22 m bigger than forecast
    And one of those mornings was also confirmed by 3 more people, while a fifth device called it double overhead or more
    When the nightly fit runs on those mornings, with and without the wild claim
    Then the wild claim moved the stored difference no further than a claim pinned at the day's fence could
    And it still moved it a little, because even an outlier keeps a voice

  @slice-04 @driving_port @in-memory @negative @covers-R31
  Scenario: Chronic disagreement is down-weighted, never silenced
    Given 8 mornings at Playa Venao each reported by three people who agreed the waves came in 0.22 m bigger than forecast
    And a fourth device that reported every one of those mornings as double overhead or more
    When the nightly fit runs on those mornings, with and without that device's reports
    Then that device's habit moved the stored difference to less than six tenths of what full trust would allow
    And to more than nothing at all, because down-weighting is never a ban

  @slice-04 @driving_port @in-memory @covers-R31
  Scenario: A newcomer's first morning enters at full voice
    Given 22 mornings at Playa Venao were reported by 7 people who saw the waves come in 0.22 m bigger than forecast
    When the nightly fit runs on those mornings, once with one more morning from a familiar reporter and once with the same morning from a brand-new device
    Then the stored difference and count are identical either way, because a newcomer starts at full voice

  @slice-04 @driving_port @in-memory @covers-R32
  Scenario: A morning of a kind nobody usually reports counts for more
    Given 22 mornings at Playa Venao were reported by 7 people who saw the waves come in 0.22 m bigger than forecast
    And ninety days of published calls where mornings like the reported ones looked good and the unreported kind looked bad
    When the nightly fit runs twice, with one extra volunteered morning landing first on a good-looking day and then on a bad-looking one
    Then the extra morning on the bad-looking day moved the stored difference more, because its kind is almost never heard from

  @slice-04 @driving_port @in-memory @negative @covers-R32
  Scenario: A morning the site asked for counts plainly, wherever it lands
    Given 22 mornings at Playa Venao were reported by 7 people who saw the waves come in 0.22 m bigger than forecast
    And ninety days of published calls where mornings like the reported ones looked good and the unreported kind looked bad
    When the nightly fit runs twice more, with the same extra morning on the bad-looking day first volunteered and then asked for
    Then the asked-for morning moved the stored difference less than the volunteered one, because being asked removes the rarity bonus

  @slice-04 @driving_port @in-memory @security @covers-R33
  Scenario: A habit of calling it big, seen at two beaches, is measured and mostly subtracted
    Given honest mornings at two Pacific beach spots
    And one reporter who called every one of their nine mornings a full band bigger, across both beaches
    When the nightly fit runs on those mornings, with and without that reporter's mornings
    Then the habit moved the stored differences by less than half of what full trust would allow
    And the habit reporter's mornings still counted at both beaches
    And nothing the fit stores names any reporter or carries any personal habit

  @slice-04 @driving_port @in-memory @negative @security @covers-R32
  Scenario: A discovered campaign is excised by an incident file that names reporters, never reports
    Given 22 mornings at Playa Venao were reported by 7 people who saw the waves come in 0.22 m bigger than forecast
    And the incident file records one of those reporters at no weight after a discovered campaign
    When the nightly fit runs on those mornings, with and without that reporter's mornings
    Then both runs stored byte-identical corrections, because the incident file excised the campaign by recompute
