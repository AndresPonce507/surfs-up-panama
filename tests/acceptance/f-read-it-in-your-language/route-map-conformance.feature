@feature-f-read-it-in-your-language
Feature: The route map cannot lie

  Today the route map builds five English address families while the site
  emits no English page at all: every builder points into a tree that was
  deliberately removed. This check makes that class of lie impossible in
  either direction: an address the map builds must resolve to an emitted
  page, and an emitted page must have its twin under the map's word
  mapping, or a written debt line says why not yet. The expected set is
  derived from the emitted Spanish tree, never from a hand-kept list, so
  a page any lane adds tomorrow is caught the day it lands.

  @READ-04 @slice-04 @driving_port @real-io @negative @error @covers-R16 @covers-R12
  Scenario: A dead builder fails the build by name
    Given a contained site fixture whose route map builds an address family with no emitted page
    When the route-conformance check inspects the contained fixture
    Then the route-conformance check does not succeed
    And the refusal names the dead builder and the address it builds
    And the seeded fixture and the repository stay unchanged

  @READ-04 @slice-04 @driving_port @real-io @negative @error @covers-R17
  Scenario: A page without its twin fails the build until the twin exists or the debt is written
    Given a contained site fixture carrying a Spanish page whose English twin is missing and unrecorded
    When the route-conformance check inspects the contained fixture
    Then the route-conformance check does not succeed
    And the refusal names the twinless page and the twin address it expects
    And the same page with a written debt line and reason passes as measured debt

  @READ-04 @slice-04 @driving_port @real-io @property @covers-R16 @covers-R17
  Scenario: A fully twinned tree passes with every family resolved
    Given a contained site fixture whose emitted pages and route map agree in both directions
    When the route-conformance check inspects the contained fixture
    Then the route-conformance check succeeds
    And the report names every address family as resolved

  @READ-04 @slice-04 @driving_port @real-io @covers-R18
  Scenario: The yesterday page's address flows from the route map
    Given the day's call is published and the site is built
    When the yesterday route is looked up for both languages
    Then the route map answers with the Spanish yesterday address and its English twin
    And the emitted Spanish yesterday page sits at the exact address the route map builds
