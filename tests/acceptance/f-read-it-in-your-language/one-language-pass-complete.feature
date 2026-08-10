@feature-f-read-it-in-your-language
Feature: The pass ran once, the debt is zero, and the sentence is true

  This is the row the epic placed the feature last for: one translation
  pass over settled copy. At settle, whatever the Spanish tree emits, the
  English tree emits; the three exceptions files are empty and their
  mechanisms deleted, because a permanent exceptions file is how ratchets
  rot into allowlists; and the epic sentence is walkable end to end. The
  pass adds twins and never edits originals: not one verbatim string
  reworded in either language.

  These scenarios go red for the right reason only at settle
  (Pre-requisite 6, coordinator-declared). Authored now; unskipped then.

  Background:
    Given the day's call is published and the site is built

  @READ-08 @slice-08 @driving_port @real-io @covers-R30
  Scenario: The ratchets flip to absolute and stay green
    Given the copy-shipping lanes have settled
    When the three checks run in absolute mode
    Then all three succeed with zero recorded debt
    And no exceptions mechanism remains to grow back

  @READ-08 @slice-08 @driving_port @real-io @property @covers-R31
  Scenario: Every page the Spanish site has, the English site has
    When the emitted trees are compared in both directions
    Then every Spanish page has its English twin and every English page maps back
    And zero debt lines remain in either direction

  @READ-08 @slice-08 @driving_port @real-io @e2e @covers-R32
  Scenario: The epic sentence walks end to end
    Given the visitor is reading any page of either tree
    When the visitor taps the language toggle, reads the call, the confidence reasons and the report flow, and returns the next day to a saved address
    Then every tap lands on the exact twin page
    And the call, the reasons and the report flow read in the chosen language
    And the saved address opens in the language the visitor chose

  @READ-08 @slice-08 @driving_port @real-io @negative @covers-R33
  Scenario: The pass added twins and edited nothing
    When every settled string is compared against its source of record
    Then not one verbatim string differs in either language
    And no new string carries an em dash
    And the Spanish surface carries zero English and the English surface zero Spanish beyond the immutable receipt quote, if quoting is how the receipt resolved
