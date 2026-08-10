@feature-f-read-it-in-your-language
Feature: Nobody can ship a half-covered string

  Ten other lanes are adding Spanish copy right now. This check exists so
  that a string existing in one language and not the other turns the build
  red the day it lands, naming the exact file, the key path and the
  missing language. Coverage is derived from structure, never from a
  hand-kept list, and a bracketed placeholder is missing coverage by its
  own admission. Enforcement is a ratchet: recorded debt is tolerated and
  measured, new debt is refused, and the debt file may only ever shrink.

  Every scenario here drives the check against a contained seeded fixture,
  the same shape the bill guardrails use: the seeded offender proves the
  check fires, and the repository is left untouched.

  @READ-02 @slice-02 @driving_port @real-io @negative @error @covers-R8 @covers-R12
  Scenario: A bracketed placeholder is missing coverage, never coverage
    Given a contained copy fixture whose English tree carries a bracketed placeholder
    When the translation-coverage check inspects the contained fixture
    Then the translation-coverage check does not succeed
    And the refusal names the exact file, the key path, and the missing language
    And the seeded fixture and the repository stay unchanged

  @READ-02 @slice-02 @driving_port @real-io @negative @error @covers-R9 @covers-R12
  Scenario: A field named in one language with no twin is refused
    Given a contained copy fixture carrying a user-facing export whose name encodes Spanish only
    When the translation-coverage check inspects the contained fixture
    Then the translation-coverage check does not succeed
    And the refusal names that export and the language it lacks

  @READ-02 @slice-02 @driving_port @real-io @covers-R9
  Scenario: Ordinary English words ending in es never trigger the naming detector
    Given a contained copy fixture whose exports are ordinary English words ending in es
    When the translation-coverage check inspects the contained fixture
    Then the translation-coverage check succeeds and names no offender

  @READ-02 @slice-02 @driving_port @real-io @negative @error @covers-R10 @covers-R12
  Scenario: A built English page rendering missing text is refused
    Given a contained built tree whose English page renders missing text where its call should be
    When the translation-coverage check inspects the contained built tree
    Then the translation-coverage check does not succeed
    And the refusal names the page and what failed to render

  @READ-02 @slice-02 @driving_port @real-io @negative @covers-R11
  Scenario: Recorded debt is tolerated and measured, new debt is refused by name
    Given the known offenders are recorded in the exceptions file with a written reason per line
    When the translation-coverage check inspects a contained fixture carrying one recorded offender and one new offender
    Then the recorded offender passes as measured debt
    And the new offender is refused by name

  @READ-02 @slice-02 @driving_port @real-io @negative @error @covers-R11
  Scenario: The debt file only ever shrinks
    Given the exceptions file recorded a set of offenders
    When the translation-coverage check sees the exceptions file grow
    Then the translation-coverage check does not succeed
    And the refusal says the debt grew and names the added line
