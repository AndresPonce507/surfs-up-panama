@feature-daily-call-with-permanent-receipts
Feature: The page-weight gate keeps the beach-3G promise measurable

  A surfer with one bar of signal on the sand gets the home page in under two
  seconds. That holds only while every built route stays inside the byte
  ceilings the architecture declares: the home document at or under 14 KB
  gzipped, every route at or under 100 KB on first visit. The gate shows its
  measurement route by route, so a passing result is evidence rather than a
  claim, and a build that would break the promise fails the gate naming the
  route, the measured bytes and the ceiling.

  Background:
    Given the site owner protects the beach-3G page weight of every built route

  @slice-08 @driving_port @real-io @contract-shape:bounded-change @covers-R36
  Scenario: The page-weight gate is default-gated and every build runs it
    When the site owner reads the local CI job inventory and the site build configuration
    Then the page-weight gate is part of the default local gate
    And the site build measures the output it emits
    And a build whose output stays inside every ceiling finishes
    And a build whose output breaks a ceiling cannot finish

  @slice-08 @driving_port @real-io @contract-shape:bounded-change @covers-R36
  Scenario: A passing measurement names every route it measured and every route it did not
    When the site owner measures a clean contained build output
    Then the page-weight measurement finishes successfully
    And every contained route is named with its measured document bytes and its ceiling
    And every contained route is named with its measured first-visit bytes and the 100 KB ceiling
    And the measurement names the declared routes this feature does not build
    And the measurement carries no bare success message

  @slice-08 @driving_port @real-io @negative @error @coupled @contract-shape:bounded-change @covers-R36
  Scenario: Every route document pushed past its ceiling is refused by name
    When the site owner pushes each contained route document past its ceiling
      | route                       | document              | ceiling  |
      | /                           | index.html            | 14 KB gz |
      | /spots/{slug}/ayer          | spots/playa-venao/ayer.html | 14 KB gz |
      | /spots/{slug}/reportar      | spots/playa-venao/reportar.html | 6 KB gz |
      | /spots/{slug}/reportado     | spots/playa-venao/reportado.html | 4 KB gz |
    Then each oversize route is refused naming the route, the measured bytes, the ceiling and its largest contributors
    And no refusal reports a measured-and-passing result
    And contained refusals leave the source fixture and the repository build output unchanged

  @slice-08 @driving_port @real-io @negative @error @contract-shape:bounded-change @covers-R36
  Scenario: A route whose first-visit assets pass the 100 KB cap is refused by name
    When the site owner adds a first-visit asset that pushes a contained route past the 100 KB cap
    Then the first-visit refusal names the route, the measured first-visit bytes, the 100 KB ceiling and its largest contributors
    And no refusal reports a measured-and-passing result
    And contained refusals leave the source fixture and the repository build output unchanged

  @slice-08 @driving_port @real-io @negative @error @coupled @contract-shape:bounded-change @covers-R36
  Scenario: Anything the gate cannot measure is refused instead of reported green
    When the site owner offers each unmeasurable build output
      | witness                        | what the gate cannot measure                        |
      | absent build output            | no built document exists to measure                 |
      | undeclared emitted document    | an emitted route carries no declared ceiling        |
      | unreachable first-visit asset  | a referenced first-visit asset is not in the output  |
      | third-party first-visit asset  | a referenced first-visit asset is served elsewhere   |
    Then each unmeasurable output is refused naming what could not be measured, why it matters and how to restore it
    And no refusal reports a measured-and-passing result
    And contained refusals leave the source fixture and the repository build output unchanged

  @slice-08 @driving_port @real-io @negative @error @contract-shape:bounded-change @covers-R36
  Scenario: A reading route that blocks first paint on a subresource is refused
    When the site owner makes a contained reading route wait for a subresource before first paint
    Then the first-paint refusal names the route, the blocking subresource, why it breaks the two-second promise and how to restore it
    And no refusal reports a measured-and-passing result
    And contained refusals leave the source fixture and the repository build output unchanged
