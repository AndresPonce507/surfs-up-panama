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
  Scenario Outline: La playa explica la mejora sin inventar una cifra
    Given una mañana publicada donde cada día conserva la corrección que formó su puntaje
    When el surfista abre la playa "nombre-mas-largo" a 390 px, con tema "<tema>" y movimiento "<movimiento>"
    Then la sección de hoy dice cuánto marcaría sin su causa publicada
    And la sección de mañana dice cuánto marcaría sin su causa publicada
    And ninguna sección toma la cifra de mejora del otro día
    And la frase del punto débil cumple las siete comprobaciones visuales sobre el fondo real
    And la explicación publicada no deja cálculo ni seguimiento en el teléfono

    Examples:
      | tema   | movimiento |
      | claro  | normal     |
      | oscuro | reducido   |

  @slice-03 @driving_port @real-io @adapter-integration @negative @error @covers-R9 @covers-R12
  Scenario: La publicación rechaza una mejora menor que el puntaje publicado
    Given una mañana publicada donde cada día conserva la corrección que formó su puntaje
    When la publicación revisa una mejora menor que el puntaje publicado
    Then la publicación se niega antes de preparar una página

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

  @slice-04 @driving_port @real-io @adapter-integration @negative @error @covers-R13 @covers-R16
  Scenario: El desglose llega completo desde la mañana que publicó la llamada
    Given una mañana publicada que trae el desglose hora por hora de sus dos días
    And en esa misma mañana una playa vieja se publicó sin ese desglose
    When la publicación revisa esa mañana y una copia con una hora malformada
    Then acepta el desglose fresco junto a la ausencia heredada, y se niega antes de preparar una página con la hora malformada

  @slice-04 @driving_port @in-memory @covers-R13 @covers-R15
  Scenario: Un dato ausente sigue ausente en el desglose
    Given una playa con sus constantes y una mañana de modelos y marea que se quedó sin viento
    When esa mañana se publica
    Then el desglose publicado repite cada hora calificada y deja el viento ausente, sin un cero en su lugar

  @slice-04 @driving_port @real-io @adapter-integration @covers-R13
  Scenario: Cada día lee solo la hora que explica su ventana
    Given una mañana publicada donde las horas vecinas se ven mejor que la hora de la ventana
    When el surfista abre la playa "desglose-honesto" a 390 px
    Then cada día imprime los cuatro valores de su propia hora de ventana, sin promediar ni saltar a la hora vecina

  @slice-04 @driving_port @real-io @adapter-integration @negative @covers-R14
  Scenario: La flecha sigue el punto débil publicado, no la barra más baja
    Given una mañana publicada donde la hora de la ventana trae un valor menor que el punto débil publicado
    When el surfista abre la playa "desglose-honesto" a 390 px
    Then la flecha marca el punto débil publicado y la fila más baja queda como una fila común
    And ninguna fila sin dato se queda con la flecha

  @slice-04 @driving_port @real-io @adapter-integration @ui-u1 @ui-u2 @ui-u3 @ui-u4 @ui-u5 @ui-u6 @ui-u7 @covers-R15 @covers-R17 @covers-R21 @covers-R22 @covers-R23 @covers-R24 @covers-R25 @covers-R26 @covers-R27
  Scenario Outline: El surfista lee cuatro razones de su mejor ventana sin una mentira por datos faltantes
    Given una mañana publicada donde una hora de ventana perdió el viento y otra perdió la marea
    When el surfista abre la playa "sin-viento-en-la-ventana" a 390 px, con tema "<tema>" y movimiento "<movimiento>"
    Then cada día muestra cuatro filas con su valor publicado o con su ausencia dicha en palabras
    And el desglose cumple las siete comprobaciones visuales sobre el fondo real
    And el nombre de playa más largo tampoco desborda sus cuatro filas

    Examples:
      | tema   | movimiento |
      | claro  | normal     |
      | oscuro | reducido   |

  @slice-04 @driving_port @real-io @adapter-integration @negative @error @covers-R16
  Scenario: La playa expone sus cuatro razones sin recalcular ni inventar nada
    Given una mañana publicada donde un día no trae ventana y una playa vieja no trae desglose
    When el surfista abre la playa "sin-ventana" a 390 px
    Then el día sin ventana no deja ni desglose ni recuadro vacío, y el otro día conserva el suyo
    And la playa sin desglose heredado queda sin barras y la mañana lo registra una sola vez por día
    And el desglose publicado no deja cálculo ni código en el teléfono

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
    And el surfista ya miró la lista de hoy sin culpables
    When el surfista abre la playa "dos-dias-distintos" a 390 px
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

  @slice-05 @driving_port @real-io @adapter-integration @negative @error @covers-R20
  Scenario: Cada playa recibe un mapa con una fuente que sí podemos mostrar
    Given la política de mapas que este proyecto sí puede mostrar
    When la construcción decide playa por playa, junto a una copia sin el crédito de una playa
    Then cada playa aprobada trae su crédito visible en español, la playa sin fuente de orientación queda fuera, y la copia sin crédito se niega antes de dibujar

  @slice-05 @driving_port @real-io @adapter-integration @negative @error @covers-R18 @covers-R20 @covers-R30
  Scenario: El mapa que abre el surfista ya viene listo, sin pedir un mosaico
    Given la política de mapas que este proyecto sí puede mostrar
    When la construcción dibuja los mapas, los vuelve a dibujar sin cambiar nada, y luego lo intenta con una política rota
    Then cada playa aprobada queda con su propio archivo liviano y su fila en el listado, el segundo dibujo repite las mismas identidades, y la política rota se niega antes de escribir un archivo

  @slice-05 @driving_port @real-io @adapter-integration @negative @error @covers-R18 @covers-R20
  Scenario: La flecha del mapa sigue la orientación que conoce esa playa
    Given la semilla que dice hacia dónde mira cada playa
    When la construcción dibuja los mapas, luego gira una sola playa, y luego le borra la orientación a otra
    Then cada flecha sale de la orientación declarada de su propia playa, girar una mueve solo su mapa, y la playa sin orientación usable se queda sin mapa
