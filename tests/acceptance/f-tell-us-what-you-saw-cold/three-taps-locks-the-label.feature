@feature-f-tell-us-what-you-saw-cold
Feature: Three taps and the label is locked on the phone before anything else

  A surfer walking off Playa Venao with fifteen seconds of patience answers
  how big, how the wind was and how it was, taps Mandar, and the screen
  changes to a saved confirmation that carries no score, no forecast and no
  way back to the form. The label is on the phone for good before anything
  else happens. This slice needs no server and no signal: the whole walk runs
  against the built site, and cutting the network must change nothing.

  @slice-01 @walking_skeleton @driving_port @real-io @covers-R1 @covers-R3
  Scenario: A surfer walking off Playa Venao locks a label in three taps
    Given the built site is running as it would be at the beach
    And a surfer walks off the water at Playa Venao and opens its spot page
    When the surfer follows "¿ESTUVISTE? CUÉNTANOS"
    Then the report screen asks exactly the three settled questions and nothing else
    When the surfer answers waist to chest, choppy wind and a good session
    And the surfer taps Mandar
    Then the screen changes to the saved confirmation
    And the confirmation carries no score, no forecast and no comparison
    And the confirmation offers no way back to an editable form

  @slice-01 @real-io @error @covers-R2 @covers-R8
  Scenario: The same three taps work with the signal cut, because the label lives on the phone
    Given a surfer has the report screen open for Playa Venao
    And the signal drops before they answer
    When the surfer answers waist to chest, choppy wind and a good session
    And the surfer taps Mandar
    Then the screen changes to the saved confirmation
    And the saved confirmation reads exactly "Guardado. Cuando vuelva la señal lo mandamos y te decimos cómo nos fue."
    And nothing on the screen reads as an error

  @slice-01 @real-io @covers-R2 @covers-R5
  Scenario: What the phone keeps is exactly what the surfer said, in the shared vocabulary
    Given a surfer saved a report for Playa Venao with the signal cut
    Then the phone holds exactly one saved report
    And the saved report says waist to chest, choppy and good in the one shared vocabulary
    And the saved report carries a fresh identity, an empty photo list and no placeholder wording

  @slice-01 @real-io @error @covers-R4
  Scenario: Back never returns to an editable form and a new report starts blank
    Given a surfer saved a report for Playa Venao with the signal cut
    And the signal returns
    When the surfer presses back from the confirmation
    Then the surfer lands on the spot page, never on an editable form
    When the surfer opens the report screen again
    Then a blank new report starts
    When the surfer answers waist to chest, choppy wind and a good session
    And the surfer taps Mandar
    Then the phone holds two saved reports with two different identities

  @slice-01 @real-io @error @covers-R6
  Scenario: A phone that cannot keep the label is told plainly before answering
    Given the built site is running as it would be at the beach
    And the surfer's phone refuses to keep anything saved
    When a surfer opens the report screen for Playa Venao
    Then the screen says plainly that the report cannot be saved on this phone
    When the surfer answers waist to chest, choppy wind and a good session
    And the surfer taps Mandar
    Then the screen never claims the label was saved
