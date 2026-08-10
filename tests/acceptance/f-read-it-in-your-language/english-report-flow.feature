@feature-f-read-it-in-your-language
Feature: The report flow reads in English and the wire never knows

  A visitor on the English tree taps a real English report invitation,
  answers the three questions in English, and every state of the flow
  reads in English, while the record on the wire stays byte-identical to
  a Spanish visitor's. Answers travel as the canonical tokens of the one
  vocabulary home; only their display labels are language. The three
  questions and all fourteen option labels are settled verbatim in
  section 10 and are pinned; the invitation's copy rides Pre-requisite 1
  and is asserted by property. Flow states beyond capture go red for the
  right reason only after their producing lane lands them (f-tell-us
  slices 01 and 03 to 05).

  Background:
    Given the day's call is published and the site is built

  @READ-07 @slice-07 @driving_port @real-io @negative @covers-R26
  Scenario: The English report invitation is real words, never a placeholder
    Given the visitor is reading a spot's own page in English
    When the visitor looks for the report invitation
    Then the invitation reads real English words
    And the invitation never reads as a bracketed placeholder

  @READ-07 @slice-07 @driving_port @real-io @covers-R27
  Scenario: The three questions ask in settled English
    Given the visitor is reading a spot's own page in English
    When the visitor opens the report screen
    Then the screen asks How big?, Wind? and How was it? with the settled English answers
    And the send action and the no-script line read in settled English

  @READ-07 @slice-07 @driving_port @property @covers-R28
  Scenario: Twin visitors, identical answers, identical bytes
    Given one visitor on the Spanish tree and one on the English tree
    When each answers the same three questions the same way and sends
    Then the two committed records are the same bytes
    And every answer travels as its canonical token, never as its display words
    And neither record carries a language

  @READ-07 @slice-07 @driving_port @real-io @covers-R29
  Scenario: Every state of the flow reads in English on the English tree
    Given the visitor has sent a report from the English tree
    When the flow moves through its states
    Then queued, arrival, reveal, refusal and the counter each read in English
    And no state renders Spanish copy or missing text
