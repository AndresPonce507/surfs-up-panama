@feature-f-forecast-learns-from-the-beach
Feature: The fit refuses to correct anything until the evidence earns it

  Every morning in this file is synthetic. Nothing here is evidence that the
  forecast has learned anything and no scenario claims it has. What is proven is
  machinery: the nightly fit forms the two declared residual forms, weighs them
  against the publication gates, and refuses out loud whenever the evidence is
  thin. That refusal is the whole product at launch, because nobody has reported
  a session yet, and it is the property most worth proving: this layer can move
  every number the site publishes, so it must be unable to move any of them
  until enough different people have earned it.

  Background:
    Given Playa Venao, its scoring constants and this morning's model opinions
    And the shipped trust settings, which exclude nobody
    And the morning call that was published before anyone had reported anything

  @slice-01 @walking_skeleton @driving_port @in-memory @negative @covers-R1 @covers-R18
  Scenario: Nobody has reported a session yet, so the nightly fit writes nothing at all
    Given nobody has reported a session at Playa Venao
    When the nightly fit runs
    Then the fit finishes and reports that it wrote no correction for any spot
    And no correction is stored for Playa Venao
    And the morning call a surfer reads is byte-identical to the one published before any report existed

  @slice-01 @driving_port @in-memory @negative @error @covers-R5 @covers-R18
  Scenario: Nine mornings from three people are too few to correct anything
    Given the nightly fit already ran with nothing reported
    And 9 mornings at Playa Venao were reported by 3 people who saw the waves come in 0.22 m bigger than forecast
    When the nightly fit runs
    Then Playa Venao gets no correction applied, on 9 mornings from 3 people
    And the morning call a surfer reads is byte-identical to the one published before any report existed

  @slice-01 @driving_port @in-memory @negative @error @covers-R6 @covers-R18
  Scenario: Twelve mornings still buy nothing, because five different people are required
    Given 12 mornings at Playa Venao were reported by 3 people who saw the waves come in 0.22 m bigger than forecast
    When the nightly fit runs
    Then Playa Venao gets no correction applied, on 12 mornings from 3 people
    And the morning call a surfer reads is byte-identical to the one published before any report existed

  @slice-01 @driving_port @in-memory @negative @error @covers-R9 @covers-R18
  Scenario: Enough people, but the difference is too small to tell from noise
    Given 22 mornings at Playa Venao were reported by 7 people who saw the waves come in 0.03 m bigger than forecast
    When the nightly fit runs
    Then Playa Venao gets no correction applied, on 22 mornings from 7 people
    And the difference it measured never cleared twice its own standard error
    And the morning call a surfer reads is byte-identical to the one published before any report existed

  @slice-01 @driving_port @in-memory @covers-R13 @covers-R9 @covers-R12 @covers-R18
  Scenario: Twenty-two mornings from seven people finally earn a correction
    Given 22 mornings at Playa Venao were reported by 7 people who saw the waves come in 0.22 m bigger than forecast
    When the nightly fit runs
    Then Playa Venao earns an applied correction, on 22 mornings from 7 people
    And the difference it measured cleared twice its own standard error
    And the standard error it stored for the height is the mornings' own spread, above the physical noise floor
    And the correction it stored is no larger than the raw difference, because it is pulled toward its parent
    And the morning call a surfer reads is byte-identical to the one published before any report existed, because the builder does not read corrections yet

  @slice-01 @driving_port @in-memory @covers-R14 @covers-R10
  Scenario: The correction states its score move in the points a surfer sees
    Given 22 mornings at Playa Venao were reported by 7 people who saw the waves come in 0.22 m bigger than forecast
    And the nightly fit already ran on those mornings
    When the correction stored for Playa Venao is read back
    Then its score move is stated in the points a surfer sees, and no other unit is legal
    And it carries the height and score limits its reader must honour
    And the height difference it records is keyed to the model and the lead time it was measured on

  @slice-01 @driving_port @in-memory @negative @error @security @covers-R11 @covers-R10
  Scenario: Twenty-two reports that agree perfectly buy nothing honest disagreement could not
    Given 22 mornings at Playa Venao were reported by 7 people who all say the waves came in exactly 0.08 m bigger than forecast, with no disagreement at all
    When the nightly fit runs
    Then Playa Venao gets no correction applied, on 22 mornings from 7 people
    And the standard error it stored for the height is the physical noise floor, not the agreement of the reports

  @slice-01 @driving_port @in-memory @property @negative @security @covers-R11 @covers-R9
  Scenario: No amount of agreement makes a small difference publishable
    Given any number of mornings from at least five people whose measured difference sits under the noise floor for that many mornings
    When the nightly fit runs on each of those sets of mornings
    Then no correction is ever applied, however tightly those reports agree

  @slice-01 @driving_port @in-memory @property @covers-R2 @covers-R4
  Scenario: Every difference the fit measures is the forecast against what a person actually saw
    Given any set of reported mornings at Playa Venao
    When the same mornings are reported again with the forecast raised, then with the reported size raised, then with the reporters shuffled
    Then raising the forecast raises the difference the fit stores
    And reporting a bigger size lowers the difference the fit stores
    And shuffling which person reported which morning changes nothing, because nobody has any history yet

  @slice-01 @driving_port @in-memory @property @negative @covers-R3
  Scenario: A morning nobody had a forecast for contributes nothing to the score delta
    Given any set of reported mornings at Playa Venao, and the same set with extra mornings reported without a forecast to compare against
    When the nightly fit runs on both
    Then the extra mornings change neither the score delta nor how many mornings it counted
    And those same extra mornings do count toward the height difference

  @slice-01 @driving_port @in-memory @property @covers-R17 @covers-R2
  Scenario: Which wind a reporter named changes no number the fit writes
    Given any set of reported mornings at Playa Venao
    When the wind word on every one of those mornings is changed and the nightly fit runs again
    Then everything the fit stored is byte-identical to what it stored before

  @slice-01 @driving_port @in-memory @property @covers-R12
  Scenario: The stored difference never leaves the corridor between the raw difference and its parent
    Given any set of reported mornings at Playa Venao from at least five people
    When the nightly fit runs on each of those sets of mornings
    Then the difference it stores never exceeds the raw difference in size, and never flips its sign

  @slice-01 @driving_port @in-memory @covers-R7
  Scenario: The shipped trust settings drop nobody
    Given 22 mornings at Playa Venao were reported by 7 people, one of whom got their credential the same morning they reported
    When the nightly fit runs
    Then all 22 mornings and all 7 people counted, exactly as they would with no trust settings at all

  @slice-01 @driving_port @in-memory @negative @covers-R8
  Scenario: A trust setting that asks for a month of standing drops this morning's credential
    Given the trust settings are changed to ask for 30 days of standing
    And 22 mornings at Playa Venao were reported by 7 people, one of whom got their credential the same morning they reported
    When the nightly fit runs
    Then the mornings reported on that same-day credential are gone from the count
    And only 6 people counted toward the five that publication requires
