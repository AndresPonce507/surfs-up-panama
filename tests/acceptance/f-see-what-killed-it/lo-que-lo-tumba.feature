@feature-f-see-what-killed-it
Feature: La playa dice qué fue lo que la tumbó

  Un surfista abre su playa y quiere saber, sin pensarlo, qué le arruinó el día:
  el viento, el tamaño, la dirección o la marea. La página lo dice en palabras,
  una sola cosa por día, la misma que salió del cálculo, nunca una que la página
  deduzca por su cuenta. Cuando el día salió perfecto no hay culpable y la página
  no parece rota. Cuando la mañana se publicó sin ese dato, la página calla en vez
  de inventar.

  Los escenarios se leen en orden: el primero abre la playa y lee la frase, y cada
  uno siguiente parte de esa misma mañana publicada y aprieta un caso más.

  @slice-01 @walking_skeleton @driving_port @real-io @adapter-integration @covers-R1 @covers-R6
  Scenario: El surfista abre su playa y lee qué la tumbó hoy y qué la tumba mañana
    Given una mañana publicada donde cada playa trae el punto débil que salió del cálculo
    When el surfista abre la playa "dos-dias-distintos" a 390 px
    Then la sección de hoy nombra en palabras el punto débil publicado para hoy
    And la sección de mañana nombra en palabras el punto débil publicado para mañana
    And ninguna de las dos secciones nombra el punto débil del otro día

  @slice-01 @driving_port @real-io @adapter-integration @negative @error @covers-R2 @covers-R25
  Scenario: Un día perfecto no tiene culpable, y la página no parece rota por eso
    Given una mañana publicada donde cada playa trae el punto débil que salió del cálculo
    And en esa misma mañana una playa salió perfecta, sin nada que la tumbara
    When el surfista abre la playa "dia-perfecto" a 390 px
    Then ninguna de las dos secciones nombra un culpable
    And no queda un recuadro vacío ni una palabra suelta donde iría el culpable
    And la página sigue mostrando el puntaje, el tamaño y la ventana de los dos días
    And en esa misma mañana la playa de al lado sí nombra el suyo

  @slice-01 @driving_port @real-io @adapter-integration @negative @error @covers-R2
  Scenario: Una playa cuya mañana se publicó sin ese dato calla en vez de inventar
    Given una mañana publicada donde cada playa trae el punto débil que salió del cálculo
    And en esa misma mañana una playa se publicó sin ese dato en ninguno de sus dos días
    When el surfista abre la playa "campo-ausente" a 390 px
    Then ninguna de las dos secciones nombra un culpable
    And la página se lee completa, sin error crudo ni texto en blanco
    And en esa misma mañana la playa de al lado sí nombra el suyo

  @slice-01 @driving_port @real-io @adapter-integration @negative @error @covers-R1 @covers-R5
  Scenario: La página nombra el culpable publicado, nunca uno que deduzca ella sola
    Given una mañana publicada donde cada playa trae el punto débil que salió del cálculo
    And en esa misma mañana una playa no tuvo dato de viento hoy y su culpable publicado es la marea
    When el surfista abre la playa "sin-dato-de-viento" a 390 px
    Then la sección de hoy nombra la marea
    And la sección de hoy no nombra el viento como culpable

  @slice-01 @driving_port @in-memory @covers-R3
  Scenario: El punto débil llega a la superficie que leen las páginas, no solo al recibo
    Given una playa con sus constantes y una mañana completa de modelos, viento y marea
    When esa mañana se publica
    Then el recibo del día y la superficie de lectura nombran el mismo punto débil, playa por playa y día por día

  @slice-01 @driving_port @real-io @adapter-integration @covers-R3
  Scenario: Ninguna playa se queda callada mientras las demás sí lo dicen
    Given una mañana publicada donde cada playa trae el punto débil que salió del cálculo
    When el surfista recorre todas las playas de la lista
    Then cada playa cuya mañana trae culpable lo nombra en sus dos secciones

  @slice-01 @driving_port @real-io @adapter-integration @negative @error @covers-R28
  Scenario: La frase está en español y no filtra nada del código
    Given una mañana publicada donde cada playa trae el punto débil que salió del cálculo
    When el surfista recorre todas las playas de la lista
    Then cada frase del punto débil está en español, sin palabras del código, sin inglés y sin guiones largos

  @slice-01 @driving_port @real-io @adapter-integration @covers-R4
  Scenario: El culpable aparece en la página de la playa y no cambia la lista de hoy
    Given una mañana publicada donde cada playa trae el punto débil que salió del cálculo
    When el surfista mira la lista de hoy y después abre la playa "dos-dias-distintos" a 390 px
    Then la lista de hoy sigue igual, sin nombrar culpables
    And la página de esa playa sí nombra el suyo

  @slice-01 @driving_port @real-io @adapter-integration @ui-u1 @covers-R21 @covers-R28
  Scenario: Quien no distingue colores recibe la misma información
    Given una mañana publicada donde cada playa trae el punto débil que salió del cálculo
    When el surfista abre la playa "dos-dias-distintos" a 390 px con la pantalla lavada, sin color
    Then el punto débil se sigue leyendo en palabras, sin que el color cargue el aviso

  @slice-01 @driving_port @real-io @adapter-integration @ui-u1 @ui-u2 @ui-u3 @ui-u4 @ui-u5 @ui-u6 @ui-u7 @covers-R21 @covers-R22 @covers-R23 @covers-R24 @covers-R25 @covers-R26 @covers-R27
  Scenario Outline: La frase se lee en el teléfono, en los dos temas, con el nombre de playa más largo
    Given una mañana publicada donde cada playa trae el punto débil que salió del cálculo
    When el surfista abre la playa "nombre-mas-largo" a 390 px, con tema "<tema>" y movimiento "<movimiento>"
    Then la frase del punto débil cumple las siete comprobaciones visuales sobre el fondo real

    Examples:
      | tema   | movimiento |
      | claro  | normal     |
      | oscuro | reducido   |
