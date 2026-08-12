@feature-weather-to-site-bridge
Feature: The publisher answers only its build

  Build hands the publisher one bundle per hour and waits for the answer. The
  publisher's front door passes the call through exactly as Build made it and
  answers with what actually happened, so Build can log the truth and move
  on. When a setting the front door depends on is missing, it refuses before
  starting anything at all, saying what is missing, why it matters and how to
  fix it, the way every refusal in this pipeline speaks.

  @slice-01 @driving_port @in-memory
  Scenario: The front door passes Build's call through unchanged and answers with what happened
    Given the publisher's front door has every setting it needs
    When Build knocks with a call to publish and the cycle succeeds
    Then the exact call Build made is what the cycle received, unchanged
    And the answer tells Build the site published
    When Build knocks with a call to publish and the cycle refuses
    Then the answer tells Build nothing was published

  @slice-01 @driving_port @in-memory @error
  Scenario: A front door missing a setting refuses loudly and starts nothing
    Given the publisher's front door is missing a setting it needs
    When Build knocks with a call to publish
    Then the door refuses saying what is missing, why it matters and how to fix it
    And the cycle behind the door was never started
