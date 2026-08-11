@feature-f-tell-us-what-you-saw-cold
Feature: A saved report arrives once and stays honest while it waits

  A surfer who has already answered cold can send the saved label when there
  is signal. The surfer sees it arrive without seeing any prediction yet, and
  a repeated send never turns one honest observation into two.

  @slice-03 @walking_skeleton @driving_port @real-io @requires_external @ui-u1 @ui-u2 @ui-u3 @ui-u4 @ui-u5 @ui-u6 @ui-u7 @covers-R19 @covers-R22 @covers-R25
  Scenario: A surfer sends a saved report and sees it arrive
    Given Playa Venao can receive reports now
    And a surfer opens the real report screen for Playa Venao
    When the surfer completes and sends a waist to chest, choppy and good report
    Then the surfer sees that their report arrived
    And the arrival says nothing about our forecast
    And nothing in the arrival reads as an error

  @slice-03 @real-io @requires_external @error @covers-R20
  Scenario: Sending the same saved report again leaves one arrival
    Given a surfer has just seen their report arrive at Playa Venao
    When the surfer sends the same report again
    Then the surfer sees one arrival, not two
    And nothing in the arrival reads as an error

  @slice-03 @real-io @requires_external @error @covers-R23 @covers-R36
  @driving_port
  Scenario: A full daily allowance defers another saved report
    Given a surfer has a saved report for Playa Venao
    And a real report device has reached its daily allowance
    When the surfer sends the saved report
    Then the report is deferred until the next day

  @slice-03 @real-io @requires_external @error @driving_port @covers-R24
  Scenario: A named beach is refused before its report arrives
    Given a surfer has a saved report for a beach Surfs Up Panama does not know
    When the surfer sends the saved report
    Then the report is refused because the named beach is not known

  @slice-03 @real-io @requires_external @covers-R21 @covers-R26
  Scenario: Opening the report screen sends a report that was already waiting
    Given a surfer has a saved report for Playa Venao
    When the surfer opens the report screen with signal
    Then the surfer sees that their report arrived
    And the arrival says nothing about our forecast
