@feature-f-read-it-in-your-language
Feature: The pasted call is English when the visitor's tree is English

  A visitor on the English tree taps once and the message they paste into
  the group is English end to end: date, spot, score, size, wind, window,
  confidence, link. The English template is settled verbatim in section
  10; the share surface itself belongs to another lane, and these
  scenarios go red for the right reason only after that lane's share
  island, template composer and preview block exist (f-paste slices 01 to
  04). Authored now so the slice's contract is on disk; unskipped then.

  Background:
    Given the day's call is published and the site is built

  @READ-06 @slice-06 @driving_port @real-io @covers-R24
  Scenario: One tap on the English tree pastes the call in English
    Given the visitor is reading the English home
    When the visitor shares the day's call
    Then the pasted message is the settled English template carrying that build's real values
    And the pasted link is the full address of the shared page carrying the build marker

  @READ-06 @slice-06 @driving_port @real-io @covers-R25
  Scenario: A shared link previews naming both languages honestly
    When the link preview declarations of every page are inspected
    Then every page declares Spanish Panama as its locale with the English alternate beside it
