@feature-f-works-with-no-signal
Feature: An old forecast says so

  A forecast served from the phone is honest about its age. Every reading page
  carries its own publish moment inside the document, so a copy kept on the
  phone tells the truth with no help from the site. Under three hours the
  settled stamp is honest on its own; past three hours the amber line flips to
  the settled words: "Viejo. Lo último que vimos fue a las {hora}. No pudimos
  sacar datos nuevos esta mañana." The original publish moment underneath is
  never rewritten, so an old score can never dress up as a new call. This is
  the most-read honesty surface the feature produces: a stale forecast must
  LOOK stale, and a fresh one must never be called old.

  One copy gap, recorded not invented: section 12 speaks of upgrading the
  stamp to a relative age, and no settled Spanish string exists for that
  relative form in section 10. These scenarios therefore pin only settled
  words: the absolute stamp and the Viejo line. The relative form waits for
  its string (routed to Andres via the cousin's crew, with the Pre-requisite
  6a strings); nothing here may invent it.

  @slice-02 @driving_port @real-io @covers-R15
  Scenario: A fresh forecast is never called old
    Given a surfer has read the home page with signal
    Then the page carries its publish stamp as a plain clock time
    And the page keeps the exact publish moment underneath where the phone can read it
    And the page does not call the forecast old

  @slice-02 @driving_port @real-io @error @covers-R16 @covers-R17 @covers-R38
  Scenario: Three hours later the same page admits it is old
    Given a surfer has read the home page with signal
    When more than three hours pass and the surfer looks at the forecast again
    Then the page says Viejo, with the hour we last saw and that no new data came
    And the publish moment the page carries underneath is the one it always had
    And nothing on the page is English, machine text or a raw timestamp

  @slice-02 @driving_port @real-io @error @covers-R15 @covers-R16 @covers-R17 @covers-R38
  Scenario: An old forecast served with no signal looks old, never fresh
    Given a surfer has read the home page with signal
    When the signal drops and, hours later, the surfer opens the home page again
    Then the same forecast is on the screen, with the time stamp it already carried
    And the page says Viejo, with the hour we last saw and that no new data came
    And the publish moment the page carries underneath is the one it always had
    And nothing on the screen is a browser error page

  @slice-02 @driving_port @real-io @error @covers-R15 @covers-R41
  Scenario: With no JavaScript the page still tells the true hour
    Given a surfer whose phone runs no JavaScript reads the home page with signal
    Then the page carries its publish stamp as a plain clock time
    And nothing on the page is English, machine text or a raw timestamp

  @slice-02 @real-io @nfr @covers-R18
  Scenario: Admitting age costs almost nothing to carry
    Given the offline-capable built site is running as it would be at the beach
    When the site owner weighs the script that admits a forecast is old
    Then the age script weighs 0.3 KB gzipped or less
