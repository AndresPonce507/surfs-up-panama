@feature-f-tell-us-what-you-saw-cold
Feature: The phone sends its own saved report

  A saved label must leave the phone because the report page sends it. The
  phone asks for its anonymous permission in the background, keeps its exact
  saved label until the answer arrives, and never shows a forecast before that
  answer.

  @slice-03 @driving_port @real-io @local-real-io @ui-u1 @ui-u2 @ui-u3 @ui-u4 @ui-u5 @ui-u6 @ui-u7 @error @covers-R19 @covers-R22 @covers-R25 @covers-R38
  Scenario: Mandar starts the saved label's anonymous journey from the phone
    Given the built site is running as it would be at the beach
    And a surfer has the report screen open for Playa Venao
    When the surfer answers waist to chest, choppy wind and a good session
    And the surfer taps Mandar
    Then the phone keeps one saved label while it waits for an answer
    And the page itself asks for anonymous permission and sends that exact saved label
    And the phone receives the saved label's private answer before it can show the outcome
    And the surfer sees their saved report arrived only after its matching answer
    And the surfer sees neither an account step nor our forecast before a server answer

  @slice-03 @driving_port @real-io @no-write-endpoints @covers-R19
  Scenario: A static page without write endpoints keeps its saved label on the phone
    Given the built site is running as it would be at the beach
    And a surfer has the report screen open for Playa Venao
    When the surfer answers waist to chest, choppy wind and a good session
    And the surfer taps Mandar
    Then the endpoint-free static page keeps exactly one saved label and sends nothing
