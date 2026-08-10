@feature-f-tell-us-what-you-saw-cold
Feature: Nothing of ours before yours, and the report screens stay honest and light

  The report capture route may never receive forecast data. Not in the page,
  not in anything the page loads, not by reloading mid flow, not on the saved
  confirmation. The closure is structural and the gate that enforces it must
  be seen refusing a deliberately poisoned page at authoring time, because a
  leak gate never seen firing proves nothing. The same built screens carry no
  path into the removed English tree, say plainly that reporting needs
  JavaScript while reading never does, and stay inside the beach byte
  ceilings.

  @slice-01 @real-io @negative @covers-R7 @covers-R38
  Scenario: No forecast reaches the report screens at any moment before the label is saved
    Given the built site is running as it would be at the beach
    And a surfer walks off the water at Playa Venao and opens its spot page
    When the surfer follows "¿ESTUVISTE? CUÉNTANOS"
    Then nothing the report screen shows or loads carries forecast data
    When the surfer reloads mid flow
    Then a blank new report starts
    And nothing the report screen shows or loads carries forecast data
    When the surfer answers waist to chest, choppy wind and a good session
    And the surfer taps Mandar
    Then the screen changes to the saved confirmation
    And the confirmation carries no score, no forecast and no comparison

  @slice-01 @real-io @error @driving_port @covers-R7
  Scenario: A deliberately poisoned page cannot slip past the leak gate
    Given a contained copy of the built site whose report screen is poisoned with a forecast
    When the leak gate examines the poisoned copy
    Then the gate refuses the poisoned copy naming the report route and what leaked
    When the leak gate examines a clean copy of the built site
    Then the gate lets the clean copy pass naming what it checked
    And the leak gate runs in the default local gate
    And contained leak proofs leave the repository build output unchanged

  @slice-01 @real-io @negative @covers-R10
  Scenario: The built report screens carry no path into the removed English tree
    Given the built site is running as it would be at the beach
    Then the built report screens link no removed English twin

  @slice-01 @real-io @error @covers-R9
  Scenario: With JavaScript off, reporting says so plainly and reading still works
    Given the built site is running as it would be at the beach
    And the surfer's phone runs no JavaScript
    When a surfer opens the report screen for Playa Venao
    Then the screen says exactly "Para mandar reportes hace falta JavaScript. Para leer el pronóstico no."
    And there is no way to send a report
    When the surfer returns to the spot page
    Then the spot page still reads fine without JavaScript

  @slice-01 @real-io @covers-R11
  Scenario: The report screens stay light enough for one bar of signal
    Given the built site is running as it would be at the beach
    Then the report screen document weighs at most 6 KB gzipped
    And the saved screen document weighs at most 4 KB gzipped
    And everything the report screen loads beyond its document stays within the 5 KB island budget
