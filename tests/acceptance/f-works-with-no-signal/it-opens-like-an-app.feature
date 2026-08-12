@feature-f-works-with-no-signal
Feature: It opens like an app

  A surfer adds the site to their home screen and it opens like an app:
  standalone, in Spanish, starting at the front page, with real icons. On
  iPhone that installed context is also the only door through which alerts
  can ever be offered, which is why the settled A2HS hint exists.

  THE HINT RENDERS SOFTENED, BY RATIFIED DECISION (2026-08-12). The settled
  hint copy ("¿Quieres avisos? En iPhone: Compartir, y luego Añadir a
  pantalla de inicio. Sin eso, iPhone no deja avisar.") opens by promising
  avisos, and no live way to ask for avisos exists until the push feature
  ships its subscribe path. No slice ships a sentence that is not true at
  the moment it ships — the rule that first staged this hint dark. Andres
  ruled on 2026-08-12 that the hint itself renders NOW, wearing only what is
  true today: installing puts the site one tap away and it opens without
  signal. The settled avisos wording returns in the same change that brings
  the subscribe path live, owned by the push lane's launch checklist
  (docs/feature/f-tell-me-when-its-worth-the-drive/launch-checklist.md; the
  decision and restore condition are recorded in this feature's delta). The
  second scenario below asserts BOTH halves: the install hint is present,
  and no aviso word renders anywhere on the page.

  @slice-05 @driving_port @real-io @covers-R31
  Scenario: The site offers itself to the home screen with its settled identity
    Given the offline-capable built site is running as it would be at the beach
    When a surfer's phone asks how the site wants to live on a home screen
    Then the site presents itself in Spanish as its own app that opens at the front page
    And both home-screen icons are real and the phone can fetch them

  @slice-05 @driving_port @real-io @error @covers-R32 @covers-R41
  Scenario: No promise of avisos before avisos exist
    Given a surfer has read the home page with signal
    Then the install hint promises only what exists today
    And the page makes no promise of avisos yet

  @slice-05 @real-io @nfr @covers-R33
  Scenario: Opening like an app costs almost nothing on a normal visit
    Given the offline-capable built site is running as it would be at the beach
    When the site owner watches a normal visit and weighs what makes the site installable
    Then the app identity and the favicon together weigh 1.5 KB or less
    And the visit fetched neither home-screen icon
