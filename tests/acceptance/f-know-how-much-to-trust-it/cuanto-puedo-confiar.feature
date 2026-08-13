@feature-f-know-how-much-to-trust-it
Feature: La razón de confianza dice en cuál cosa los modelos no se ponen de acuerdo

  Un surfista ya sabe que un swell de 15 segundos y uno de 10 no son el mismo día.
  Cuando abre la razón de confianza quiere leer en cuál cosa los modelos coinciden y
  en cuál no: el tamaño, el período o la dirección. Una frase genérica no le sirve
  para decidir si maneja dos horas. Y cuando solo un modelo alcanza a ver ese spot,
  la página lo dice en vez de prometer un acuerdo que nadie tuvo.

  Los escenarios parten todos de la misma mañana publicada y aprietan un caso más.

  @slice-01 @driving_port @real-io @adapter-integration @covers-R1 @covers-R2
  Scenario Outline: En <dia>, la razón nombra en cuál cosa coinciden los modelos y en cuál no
    Given una mañana publicada donde los modelos difieren en cosas distintas según la playa
    When el surfista abre "<ruta>" a 390 px y toca la razón de confianza de cada fila
    Then alguna razón nombra la cosa en la que los modelos no coinciden
    And ninguna razón se queda solo en una frase genérica sin nombrar ninguna cosa
    And cada razón sigue diciendo que todavía nadie reportó desde la playa

    Examples:
      | dia    | ruta     |
      | Hoy    | la home  |
      | Mañana | Mañana   |

  @slice-01 @driving_port @real-io @adapter-integration @negative @error @covers-R3 @covers-R4
  Scenario: Con una sola opinión disponible, la razón dice que no hay con qué comparar
    Given una mañana publicada donde una playa tiene una sola opinión y otra tiene acuerdo real
    When el surfista abre "la home" a 390 px y toca la razón de confianza de cada fila
    Then la fila de la playa con una sola opinión dice que no hay con qué comparar
    And esa razón nunca dice que los modelos coinciden
    And la fila con acuerdo real sí dice que los modelos coinciden
    And ninguna razón muestra un número, un porcentaje ni una barra de certeza
    And ninguna razón abre vacía ni nombra un modelo por su identificador

  @slice-01 @driving_port @real-io @adapter-integration @ui-u1 @ui-u2 @ui-u3 @ui-u4 @ui-u6 @ui-u7 @covers-R5
  Scenario Outline: Con la razón más larga, las filas del teléfono siguen limpias en tema <tema> y movimiento <movimiento>
    Given una mañana publicada donde los modelos difieren en cosas distintas según la playa, con un destino de nombre largo
    When el surfista abre "la home" a 390 px, con tema "<tema>" y movimiento "<movimiento>", y toca la razón de confianza de cada fila
    Then ninguna fila se desborda el ancho de 390 px ni recorta su texto al alargarse la razón
    And el toque que abre la razón mide al menos 44 por 44 px y no tiene movimiento
    And el texto de la razón abierta tiene suficiente contraste contra el fondo real de la tarjeta

    Examples:
      | tema   | movimiento |
      | claro  | normal     |
      | oscuro | reducido   |
