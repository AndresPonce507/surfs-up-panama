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

  @slice-04 @driving_port @real-io @adapter-integration @negative @error @covers-R13
  Scenario: El desglose llega completo desde la mañana que publicó la llamada
    Given una mañana publicada con las cuatro razones de cada hora
    When la mañana queda lista para leerse
    Then la playa no recibe un desglose inventado cuando la mañana todavía no lo publicó

  @slice-04 @driving_port @real-io @adapter-integration @negative @error @covers-R15
  Scenario: Un dato ausente sigue ausente en el desglose
    Given una mañana publicada con el viento ausente en la hora elegida
    When la mañana queda lista para leerse
    Then el viento ausente no se convierte en una razón buena ni en una cifra

  @slice-04 @driving_port @real-io @adapter-integration @negative @error @covers-R13
  Scenario: Cada día lee solo la hora que explica su ventana
    Given una mañana publicada con horas distintas alrededor de su mejor ventana
    When la mañana queda lista para leerse
    Then cada día puede mostrar solo las cuatro razones de su propia ventana

  @slice-04 @driving_port @real-io @adapter-integration @negative @error @covers-R14 @covers-R15
  Scenario: La flecha sigue el punto débil publicado, no la barra más baja
    Given una mañana publicada donde la marea es menor pero el viento fue el punto débil
    When la mañana queda lista para leerse
    Then la flecha no cambia el punto débil que publicó la mañana

  @slice-04 @walking_skeleton @driving_port @real-io @adapter-integration @ui-u1 @ui-u2 @ui-u3 @ui-u4 @ui-u5 @ui-u6 @ui-u7 @covers-R13 @covers-R14 @covers-R15 @covers-R17 @covers-R21 @covers-R22 @covers-R23 @covers-R24 @covers-R25 @covers-R26 @covers-R27
  Scenario: El surfista lee cuatro razones de su mejor ventana sin una mentira por datos faltantes
    Given una mañana publicada con cuatro razones para hoy y mañana
    When el surfista abre la playa con sus cuatro razones a 390 px
    Then el surfista puede leer las cuatro razones de cada día y su punto débil escrito

  @slice-04 @driving_port @real-io @adapter-integration @negative @error @ui-u1 @ui-u2 @ui-u3 @ui-u4 @ui-u5 @ui-u6 @ui-u7 @covers-R13 @covers-R14 @covers-R15 @covers-R16 @covers-R17 @covers-R21 @covers-R22 @covers-R23 @covers-R24 @covers-R25 @covers-R26 @covers-R27
  Scenario: La playa expone sus cuatro razones sin recalcular ni inventar nada
    Given una mañana publicada con una ventana ausente y otra con un dato ausente
    When el surfista abre la playa con sus cuatro razones a 390 px
    Then la ausencia se lee como ausencia y el día sin ventana no deja un desglose vacío

  @slice-05 @driving_port @real-io @adapter-integration @negative @error @covers-R20
  Scenario: Cada playa recibe un mapa con una fuente que sí podemos mostrar
    Given una mañana publicada con la orientación declarada de una playa
    When la mañana queda lista para leerse
    Then la playa no recibe un diagrama si falta la procedencia que lo hace honesto

  @slice-05 @driving_port @real-io @adapter-integration @negative @error @covers-R18 @covers-R20
  Scenario: El mapa que abre el surfista ya viene listo, sin pedir un mosaico
    Given una mañana publicada con un diagrama local de orientación
    When la mañana queda lista para leerse
    Then la playa no recibe un mapa que dependa de otra visita

  @slice-05 @driving_port @real-io @adapter-integration @negative @error @covers-R18 @covers-R20
  Scenario: La flecha del mapa sigue la orientación que conoce esa playa
    Given dos playas publicadas con orientaciones distintas
    When la mañana queda lista para leerse
    Then ninguna playa recibe la orientación de la otra

  @slice-05 @walking_skeleton @driving_port @real-io @adapter-integration @ui-u1 @ui-u2 @ui-u3 @ui-u4 @ui-u5 @ui-u6 @ui-u7 @covers-R18 @covers-R19 @covers-R20 @covers-R21 @covers-R22 @covers-R23 @covers-R24 @covers-R25 @covers-R26 @covers-R27
  Scenario: El surfista ve el break y hacia dónde mira sin abrir otro mapa
    Given una mañana publicada con un diagrama local de orientación
    When el surfista abre la playa con su diagrama a 390 px
    Then el surfista ve un diagrama tranquilo con su explicación escrita

  @slice-05 @driving_port @real-io @adapter-integration @negative @error @ui-u1 @ui-u2 @ui-u3 @ui-u4 @ui-u5 @ui-u6 @ui-u7 @covers-R18 @covers-R19 @covers-R20 @covers-R21 @covers-R22 @covers-R23 @covers-R24 @covers-R25 @covers-R26 @covers-R27 @covers-R30
  Scenario: El mapa de la playa carga tarde sin pesar ni romper la página
    Given una mañana publicada con un diagrama local de orientación
    When el surfista abre la playa con su diagrama a 390 px
    Then el diagrama espera fuera de la primera mirada sin tapar la página

  @slice-05 @driving_port @real-io @adapter-integration @negative @error @ui-u1 @ui-u2 @ui-u3 @ui-u4 @ui-u5 @ui-u6 @ui-u7 @covers-R18 @covers-R19 @covers-R20 @covers-R21 @covers-R22 @covers-R23 @covers-R24 @covers-R25 @covers-R26 @covers-R27 @covers-R30
  Scenario: El surfista encuentra su break sin abrir un mapa pesado
    Given una mañana publicada con un diagrama local de orientación
    When el surfista abre la playa con su diagrama a 390 px
    Then aun sin su imagen la playa conserva un cuadro explicado y tranquilo

  @slice-01 @walking_skeleton @driving_port @real-io @adapter-integration @covers-R1 @covers-R6
  Scenario: El surfista abre su playa y lee qué la tumbó hoy y qué la tumba mañana
    Given una mañana publicada donde cada playa trae el punto débil que salió del cálculo
    When el surfista abre la playa "dos-dias-distintos" a 390 px
    Then la sección de hoy nombra en palabras el punto débil publicado para hoy
    And la sección de mañana nombra en palabras el punto débil publicado para mañana
    And ninguna de las dos secciones nombra el punto débil del otro día

  @slice-02 @driving_port @real-io @adapter-integration @ui-u1 @ui-u2 @ui-u3 @ui-u4 @ui-u5 @ui-u6 @ui-u7 @covers-R7 @covers-R8 @covers-R21 @covers-R22 @covers-R23 @covers-R24 @covers-R25 @covers-R26 @covers-R27
  Scenario Outline: El surfista ve el valor de la misma cosa que la tumbó
    Given una mañana publicada donde cada playa trae la causa y el valor que le corresponde
    When el surfista abre la playa "nombre-mas-largo" a 390 px, con tema "<tema>" y movimiento "<movimiento>"
    Then la sección de hoy nombra el punto débil publicado para hoy con el valor que le corresponde
    And la sección de mañana nombra el punto débil publicado para mañana con el valor que le corresponde
    And ninguna sección toma el valor publicado del otro día
    And la frase del punto débil cumple las siete comprobaciones visuales sobre el fondo real

    Examples:
      | tema   | movimiento |
      | claro  | normal     |
      | oscuro | reducido   |

  @slice-03 @driving_port @real-io @adapter-integration @ui-u1 @ui-u2 @ui-u3 @ui-u4 @ui-u5 @ui-u6 @ui-u7 @covers-R9 @covers-R11 @covers-R12 @covers-R21 @covers-R22 @covers-R23 @covers-R24 @covers-R25 @covers-R26 @covers-R27
  Scenario Outline: El surfista lee cuánto marcaría la playa sin ese punto débil
    Given una mañana publicada donde cada día trae una mejora honesta junto a su causa
    When el surfista abre la playa "nombre-mas-largo" a 390 px, con tema "<tema>" y movimiento "<movimiento>"
    Then la sección de hoy dice cuánto marcaría sin su causa publicada
    And la sección de mañana dice cuánto marcaría sin su causa publicada
    And ninguna sección toma la cifra de mejora del otro día
    And la frase del punto débil cumple las siete comprobaciones visuales sobre el fondo real

    Examples:
      | tema   | movimiento |
      | claro  | normal     |
      | oscuro | reducido   |

  @slice-03 @driving_port @real-io @adapter-integration @negative @error @covers-R12
  Scenario: El surfista no recibe una cifra repetida cuando la mejora redondea igual
    Given una mañana publicada donde la mejora redondeada no cambia el puntaje de cada día
    When el surfista abre la playa "minimo-no-publicado" a 390 px
    Then las dos frases de la causa quedan completas sin una mejora repetida

  @slice-03 @driving_port @real-io @adapter-integration @negative @error @covers-R12
  Scenario: El surfista no recibe una cifra inventada de una mañana antigua
    Given una mañana publicada donde una playa conserva sus causas pero no la mejora nueva
    When el surfista abre la playa "fila-legada" a 390 px
    Then las dos frases de la causa quedan completas sin una mejora inventada

  @slice-03 @driving_port @real-io @adapter-integration @negative @error @covers-R12
  Scenario: Un día perfecto sigue sin una frase que explicar
    Given una mañana publicada donde una playa salió perfecta, sin nada que la tumbara
    When el surfista abre la playa "dia-perfecto" a 390 px
    Then ninguna de las dos secciones nombra un culpable
    And no queda un recuadro vacío ni una palabra suelta donde iría el culpable

  @slice-03 @driving_port @real-io @adapter-integration @negative @error @covers-R12
  Scenario: La mañana registra la ausencia heredada sin confundirla con los otros silencios
    Given una mañana publicada con una ausencia heredada en sus dos días
    When la mañana queda lista para leerse
    Then la publicación señala una sola ausencia heredada por día sin confundirla con los otros silencios

  @slice-02 @driving_port @real-io @adapter-integration @negative @covers-R7 @covers-R8
  Scenario: La playa muestra el valor publicado sin inventar uno menor
    Given una mañana publicada donde el viento es la causa pero la marea tuvo un valor menor sin publicar
    When el surfista abre la playa "minimo-no-publicado" a 390 px
    Then la sección de hoy conserva el viento y su valor publicado, no la marea menor

  @slice-02 @driving_port @real-io @adapter-integration @negative @covers-R8 @covers-R28
  Scenario: Una fila legada conserva su causa sin inventar una cifra
    Given una mañana publicada donde una fila legada nombra sus causas pero no trae sus valores
    When el surfista abre la playa "fila-legada" a 390 px
    Then las dos frases legadas siguen completas sin cifra ni puntuación rota

  @slice-02 @driving_port @real-io @adapter-integration @negative @covers-R2 @covers-R8
  Scenario: Los días perfecto y sin dato siguen callados
    Given una mañana publicada donde cada playa trae la causa y el valor que le corresponde
    And en esa misma mañana una playa salió perfecta, sin nada que la tumbara
    And en esa misma mañana una playa se publicó sin ese dato en ninguno de sus dos días
    When el surfista abre la playa "dia-perfecto" a 390 px
    Then ninguna de las dos secciones nombra un culpable
    And no queda un recuadro vacío ni una palabra suelta donde iría el culpable
    And la playa sin ese dato también queda sin frase ni cifra sola

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
