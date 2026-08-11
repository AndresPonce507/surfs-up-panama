@feature-f-works-with-no-signal
Feature: The last forecast still reads when the signal drops

  A surfer parked at Venao with one bar opens the forecast and gets the last
  one that loaded, with the time stamp it already carried, instead of a browser
  error page. When the phone has nothing saved for what they asked for, they
  get plain Spanish words saying so. The whole slice runs against the built
  site with no account, no deployed resource and no live origin: the signal is
  cut at the server, which is what an unreachable origin looks like to a phone.

  The settled offline copy arrives in two honest stages. Sentence one lands
  with the reading fallback; slice-03 adds "Los reportes que mandes quedan
  guardados." only after the phone has a real queue. With zero reports waiting,
  the promise remains but there is no invented queue box to show.

  @slice-01 @walking_skeleton @driving_port @real-io @covers-R1 @covers-R2 @covers-R14 @covers-R38
  Scenario: A surfer parked at Venao with one bar still reads the last forecast that loaded
    Given the offline-capable built site is running as it would be at the beach
    When a surfer reads the home page with signal
    Then the offline helper is running on their phone
    When the signal drops and the surfer opens the home page again
    Then the same forecast is on the screen, with the time stamp it already carried
    And nothing on the screen is a browser error page

  @slice-01 @driving_port @real-io @error @covers-R2
  Scenario: A network that stalls gives up after three seconds and shows what we already had
    Given a surfer has read the home page with signal
    When the network stalls and the surfer opens the home page again
    Then the forecast is on the screen inside six seconds
    And the same forecast is on the screen, with the time stamp it already carried
    And nothing on the screen is a browser error page

  @slice-01 @slice-03 @driving_port @real-io @error @covers-R3 @covers-R4 @covers-R38 @covers-R41
  Scenario: With nothing saved for what they asked for, no signal lands on plain Spanish words
    Given a surfer has read the home page with signal
    When the signal drops and the surfer opens a spot they have never opened
    Then the sin señal page reads the settled first sentence with the hour we last saw
    And no queue box is shown when no report is waiting
    And nothing on the page is English, machine text or a raw timestamp
    And nothing on the screen is a browser error page

  @slice-01 @driving_port @real-io @covers-R5
  Scenario: The report screen opens with no signal once it has been opened with signal
    Given a surfer has read the home page with signal
    And the surfer has opened the report screen for Playa Venao with signal
    When the signal drops and the surfer opens the report screen for Playa Venao again
    Then the report screen asks the same questions it asked with signal
    And nothing on the screen is a browser error page

  @slice-01 @driving_port @real-io @error @covers-R5 @covers-R3
  Scenario: A report screen never opened before lands on the sin señal words, never an error
    Given a surfer has read the home page with signal
    When the signal drops and the surfer opens the report screen for a spot they have never opened
    Then the sin señal page reads the settled first sentence with the hour we last saw
    And nothing on the screen is a browser error page

  @slice-01 @driving_port @real-io @error @covers-R6
  Scenario: The small parts the page draws itself with come from the phone when the signal is gone
    Given a surfer has read the home page with signal
    When the signal drops and the surfer opens the home page again
    Then the small parts the page asked for come from the phone

  @slice-01 @driving_port @real-io @nfr @covers-R12
  Scenario: A whole morning's reading asks the site for ten things or fewer
    Given the offline-capable built site is running as it would be at the beach
    When a surfer reads the home page, opens Playa Venao and comes back to the home page
    Then the offline helper is running on their phone
    And the whole reading asked the site for ten things or fewer
