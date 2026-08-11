@feature-f-tell-us-what-you-saw-cold
Feature: The call is revealed only after the surfer's report arrives

  The comparison belongs to the sent report, never to a page that can be
  opened first. It tells the surfer what we said, what they saw, and whether
  we ran big or small. When there is no call for that hour, it says so plainly.

  @slice-04 @walking_skeleton @driving_port @real-io @requires_external @indeterminate @ui-u1 @ui-u2 @ui-u3 @ui-u4 @ui-u5 @ui-u6 @ui-u7 @covers-R27 @covers-R30 @covers-R33
  Scenario: A surfer sees how the call did after sending their label
    Given Playa Venao can receive reports now
    And a call is available for the surfer's report at Playa Venao
    When the surfer completes and sends a waist to chest, choppy and good report
    Then the surfer sees what we said and what they saw
    And the surfer sees whether we ran big or small in points
    And the surfer sees the report count for Playa Venao

  @slice-04 @real-io @requires_external @indeterminate @error @covers-R28 @covers-R29 @covers-R31
  Scenario: A surfer is told plainly when there is no call to compare
    Given Playa Venao can receive reports now
    And no call is available for the surfer's report at Playa Venao
    When the surfer completes and sends a waist to chest, choppy and good report
    Then the surfer is told there is nothing to compare
    And the screen invents no number or partial comparison

  @slice-04 @real-io @requires_external @error @covers-R32 @covers-R38
  Scenario: A visitor without a sent report receives no comparison
    Given Playa Venao can receive reports now
    When a visitor opens the reported screen without sending a report
    Then the visitor sees only a general thanks
    And the visitor sees no comparison or way to edit a label
