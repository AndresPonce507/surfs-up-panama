@feature-f-read-it-in-your-language
Feature: One toggle, the whole call in your language

  A visitor who does not read Spanish flips one toggle at the top of the
  page and reads today's twenty spots ranked in English. The choice holds
  on the next visit because the address itself carries it: no script
  sniffs, nothing redirects, nothing is stored. Persistence is the tree
  of addresses, and every link on an English page keeps the visitor in it.

  The toggle's label copy rides Pre-requisite 1 and is not pinned here:
  the toggle is asserted as the plain link to the twin address that
  section 4 requires, whatever words it carries.

  Background:
    Given the day's call is published and the site is built

  @READ-01 @slice-01 @walking_skeleton @driving_port @real-io @covers-R1 @covers-R2
  Scenario: A visitor who does not read Spanish flips the toggle and reads today's coast
    When the visitor on the Spanish home taps the language toggle at the top of the page
    Then the visitor is reading the English home
    And the English home ranks the same twenty spots as the Spanish home, in the same order

  @READ-01 @slice-01 @driving_port @real-io @covers-R1 @covers-R6
  Scenario: The visitor flips to tomorrow without leaving their language
    Given the visitor is reading the English home
    When the visitor flips to tomorrow
    Then the visitor is reading tomorrow's ranking in English
    And every ranked row reads in English words

  @READ-01 @slice-01 @driving_port @real-io @covers-R2
  Scenario: One tap on the toggle lands straight back on the twin page
    Given the visitor is reading tomorrow's ranking in English
    When the visitor taps the language toggle at the top of the page
    Then the visitor lands on the Spanish tomorrow page, the exact twin of where they stood

  @READ-01 @slice-01 @driving_port @real-io @property @covers-R3
  Scenario: Every link on an English page keeps the visitor in the English tree
    When the visitor follows every link on every English page
    Then every destination stays inside the English tree
    And the only way out of the tree on any page is the language toggle

  @READ-01 @slice-01 @driving_port @real-io @property @covers-R4
  Scenario: A saved address opens in the language the visitor chose
    When every page of both trees is inspected
    Then each page declares its own language
    And each page names itself and its exact twin in the other language with full addresses

  @READ-01 @slice-01 @driving_port @real-io @negative @error @covers-R5
  Scenario: No script ever decides the visitor's language
    When a visitor with scripts unavailable opens the English home
    Then that visitor is reading the English home, unredirected
    And no page of either tree sniffs, redirects, or stores a language choice

  @READ-01 @slice-01 @driving_port @real-io @negative @error @covers-R6
  Scenario: The English tree never shows half-translated text
    When every English page is read end to end
    Then no English page renders missing text
    And no English page renders a bracketed placeholder
    And no English page renders Spanish copy

  @READ-01 @slice-01 @driving_port @ui @covers-R36
  Scenario: The language toggle is comfortably tappable on every page
    When the language toggle is measured on the built pages
    Then its target is at least 44 pixels on every page of both trees

  @READ-01 @slice-01 @driving_port @real-io @covers-R7
  Scenario: The English pages are born inside the byte ceilings
    When the page-weight gate runs over the built site
    Then every English page sits at or under its ceiling
