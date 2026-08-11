@feature-f-tell-us-what-you-saw-cold
Feature: A wrong phone clock is refused plainly without losing the label

  A surfer should not lose an honest label because their phone's clock is
  badly wrong. The screen explains the refusal in plain Spanish, keeps the
  answers visible, and never pretends that waiting will make the report valid.

  @slice-05 @walking_skeleton @driving_port @real-io @requires_external @ui-u1 @ui-u2 @ui-u3 @ui-u4 @ui-u5 @ui-u6 @ui-u7 @error @covers-R34 @covers-R37
  Scenario: A surfer with a badly wrong clock keeps the label and understands the refusal
    Given the surfer's phone clock is far ahead
    And Playa Venao can receive reports now
    And a surfer opens the real report screen for Playa Venao
    When the surfer completes and sends a waist to chest, choppy and good report
    Then the surfer sees a plain explanation and keeps the label
    And the refusal says nothing about our forecast

  @slice-05 @real-io @requires_external @error @covers-R35
  Scenario: A refused report does not keep trying by itself
    Given a surfer has just been told their phone clock is wrong
    When the surfer waits without changing the clock
    Then the surfer still sees the same refusal and the same label
    And the report does not try itself again

  @slice-05 @real-io @requires_external @covers-R34
  Scenario: A fresh report can arrive after the surfer corrects the clock
    Given a surfer has just been told their phone clock is wrong
    And the surfer corrects the phone clock
    When the surfer completes and sends a fresh waist to chest, choppy and good report
    Then the surfer sees that their report arrived
