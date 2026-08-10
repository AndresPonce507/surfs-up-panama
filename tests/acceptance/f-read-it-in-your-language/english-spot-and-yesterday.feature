@feature-f-read-it-in-your-language
Feature: A spot's own page in English, and an honest English yesterday

  A visitor taps a ranked row on the English home and gets that spot's own
  page in English: today's and tomorrow's numbers, size in body-height
  words, the window. The yesterday page carries this feature's one hard
  honesty problem: receipts are immutable and were minted in Spanish, so
  the English yesterday page must never invent an English past. Whichever
  way Pre-requisite 3 resolves, one invariant holds: the page either
  quotes the Spanish call as the historical artifact it is, or plainly
  states the narrative exists in Spanish only. Synthesizing an English
  narrative is refused under both resolutions.

  Empty-state and yesterday copy is unsettled English (Pre-requisite 1)
  and is asserted by property, never pinned.

  Background:
    Given the day's call is published and the site is built

  @READ-05 @slice-05 @driving_port @real-io @covers-R19
  Scenario: A ranked row leads to that spot's own page in English
    Given the visitor is reading the English home
    When the visitor taps a ranked row
    Then the visitor is reading that spot's own page in English
    And the page carries today's and tomorrow's numbers, the size in body-height words, and the window

  @READ-05 @slice-05 @driving_port @real-io @property @covers-R20
  Scenario: The size line keeps the format law in English
    Given the visitor is reading a spot's own page in English
    When the size line is read on every English spot page
    Then the body-height word comes first and the numeric range second with the approximation mark
    And the open-ended band never claims a ceiling

  @READ-05 @slice-05 @driving_port @real-io @negative @error @covers-R21
  Scenario: What is missing is said plainly in English
    Given a spot whose day is missing a window or a size
    When the visitor reads that spot's own page on the English tree
    Then each missing value is stated as an absence in English words
    And no missing value renders as missing text or as Spanish copy

  @READ-05 @slice-05 @driving_port @real-io @negative @error @covers-R22
  Scenario: The English yesterday page never invents an English past
    Given a receipt that was minted in Spanish before English existed
    When the visitor reads that spot's yesterday page on the English tree
    Then the page presents no English narrative that was never published
    And the page either quotes the Spanish call as the historical artifact or plainly states the narrative exists in Spanish only

  @READ-05 @slice-05 @driving_port @real-io @negative @covers-R23
  Scenario: A yesterday with no receipt states the absence in English
    Given a spot with no receipt for yesterday
    When the visitor reads that spot's yesterday page on the English tree
    Then the page plainly states there is nothing to show for yesterday, in English
    And the page invents no number and no narrative
