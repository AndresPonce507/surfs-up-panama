@feature-f-know-how-much-to-trust-it
Feature: La marea que sí es de esa playa, y la confianza alta que por fin se gana sola

  Hoy ninguna playa puede decir "confianza alta" porque a todas les falta el
  número de la marea, y ese tope cae exacto sobre la frontera. La salida
  honesta es la única que existe: que cada playa que puede citar una estación
  de mareas de verdad amanezca con su número puesto, y que las que no pueden
  lo sigan diciendo claro. Ningún tope, ninguna frontera y ningún umbral se
  mueve: la confianza alta se gana con datos, jamás bajando la vara.

  # -------------------------------------------------------------------------
  # BLOQUEO REAL, registrado y no planeado por encima: el esquema de la
  # semilla de spots no tiene todavía la referencia de estación por playa
  # (04-ingest-pipeline.md sección 11, DELIVER BLOCKER; Pre-requisito 5:
  # política de mapeo sin decidir, ADR de mareas aún Proposed). Estos
  # escenarios fijan el contrato observable; el campo y la política los debe
  # el lane de dominio antes de que DELIVER pueda ponerse en verde.
  # -------------------------------------------------------------------------

  @slice-02 @driving_port @in-memory @error @covers-R15 @covers-R16 @covers-R21
  Scenario: La playa que puede citar su estación amanece con la marea puesta y la vecina sin estación sigue diciendo la verdad
    Given una mañana en que la estación de mareas responde, con una playa que puede citarla y una vecina que no
    When esa mañana se arma y se publica con la marea de cada estación
    Then las horas archivadas de la playa con estación traen su número de marea y las de la vecina quedan sin él
    And la razón de la playa con estación deja de nombrar la marea
    And la razón de la vecina sigue nombrando la marea que falta

  @slice-02 @driving_port @in-memory @negative @covers-R17 @covers-R18 @covers-R30
  Scenario: La confianza alta llega sola el día que los modelos de verdad se parecen, sin mover ningún tope
    Given una mañana en que la estación de mareas responde, con una playa que puede citarla y una vecina que no
    When esa mañana se arma y se publica con la marea de cada estación
    Then la playa con estación se publica con confianza alta
    And la vecina sin estación se queda en confianza media
    And ninguna razón culpa a los modelos de un desacuerdo que no hubo

  @slice-02 @driving_port @in-memory @negative @error @covers-R19 @covers-R30
  Scenario: Una estación muda por más de siete días devuelve la marea a ausencia declarada
    Given una playa con estación cuya estación lleva ocho días sin responder
    When esa mañana se arma y se publica con la marea de cada estación
    Then la razón de la playa con estación vuelve a nombrar la marea que falta
    And ninguna playa se publica con confianza alta

  @slice-02 @driving_port @in-memory @error @covers-R20
  Scenario: Una playa de mareas chicas con su estación puesta no confunde neutralidad con ausencia
    Given una mañana en que la estación responde para una playa de mareas chicas y su vecina de mareas chicas no tiene estación
    When esa mañana se arma y se publica con la marea de cada estación
    Then la razón de la playa de mareas chicas con estación no nombra la marea
    And su vecina de mareas chicas sigue nombrando la marea que falta y no pasa de confianza media

  # -------------------------------------------------------------------------
  # La mitad de la lectura: sobre el sitio realmente construido y servido por
  # HTTP, en Chromium a 390 px. Depende del montaje entre lanes registrado en
  # el paso 01-11: hasta que ConfidenceDetail esté montado, ninguna razón por
  # fila llega a la página.
  # -------------------------------------------------------------------------

  @slice-02 @driving_port @real-io @adapter-integration @covers-R18 @covers-R21
  Scenario: El surfista ve confianza alta solo donde los datos la ganaron
    Given una mañana publicada en que una playa ganó confianza alta y su vecina sigue sin marea
    When el surfista abre la lista del día y toca la confianza de las dos playas
    Then la playa que la ganó muestra su confianza alta por forma y palabra
    And la razón abierta de su vecina dice claro que falta la marea

  @slice-02 @driving_port @real-io @adapter-integration @ui-u1 @ui-u2 @ui-u3 @ui-u4 @ui-u5 @ui-u6 @ui-u7 @covers-R33 @covers-R34 @covers-R35 @covers-R36 @covers-R37 @covers-R38 @covers-R39
  Scenario Outline: La fila de confianza alta se lee limpia en el teléfono, tema <tema>, movimiento <movimiento>
    Given una mañana publicada en que una playa ganó confianza alta y su vecina sigue sin marea
    When el surfista abre la lista del día a 390 px con tema "<tema>" y movimiento "<movimiento>"
    Then la confianza alta y su razón cumplen las siete comprobaciones visuales sobre el fondo real

    Examples:
      | tema   | movimiento |
      | claro  | normal     |
      | oscuro | reducido   |
