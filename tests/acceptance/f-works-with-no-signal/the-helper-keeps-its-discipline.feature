@feature-f-works-with-no-signal
Feature: The offline helper keeps its discipline about what it may keep

  Keeping the last forecast on the phone is only safe while the helper is
  strict about what it is allowed to keep. A report on its way out is never
  kept and never answered from the phone: that row of the settled table ships
  today, before any write path exists, because a neighbouring feature already
  depends on it and will never edit this file. The helper also has to stay
  cheap: it has a weight it may not exceed, it leaves room for a later alerts
  feature to be added without touching a line of what it already does, and the
  weight gate has to count the new offline page instead of calling it unbuilt.

  @slice-01 @driving_port @real-io @security @covers-R8
  Scenario: A report that got through is answered by the site and left nowhere on the phone
    Given a surfer has read the home page with signal
    When the surfer's phone sends a report while the signal holds
    Then the offline helper is running on their phone
    And the answer comes from the site, not from the phone
    And nothing about the sent report is kept on the phone

  @slice-01 @driving_port @real-io @security @error @covers-R8 @covers-R9
  Scenario: With the signal gone, a planted answer is never handed back as if the report went out
    Given a surfer has read the home page with signal
    And an answer to a sent report has been planted on the phone
    When the signal drops and the surfer's phone tries to send a report
    Then the offline helper is running on their phone
    And the phone never answers with the planted copy

  @slice-01 @driving_port @real-io @covers-R10
  Scenario: A later alerts feature is added to the helper without touching a line of what it already does
    Given the built site is running as it would be at the beach
    When a later alerts feature adds its own listeners to the end of the helper
    Then not one line the helper already had has changed
    When a surfer reads the home page with signal
    And the signal drops and the surfer opens the home page again
    Then the offline helper is running on their phone
    And the same forecast is on the screen, with the time stamp it already carried

  @slice-01 @real-io @nfr @covers-R11
  Scenario: Everything this slice adds stays inside the weight it was given
    Given the built site is running as it would be at the beach
    When the site owner weighs everything this slice adds
    Then the offline helper weighs 3 KB gzipped or less
    And the sin señal page weighs 3 KB gzipped or less
    And the line that starts the helper weighs 0.2 KB or less

  @slice-01 @real-io @build @error @covers-R13
  Scenario: The weight gate counts the sin señal page instead of calling it unbuilt
    Given the built site is running as it would be at the beach
    When the site owner reads the weight measurement the build printed
    Then the sin señal page is measured by name with its bytes and its 3 KB ceiling
    And the measurement no longer lists the sin señal page among the routes it does not build
