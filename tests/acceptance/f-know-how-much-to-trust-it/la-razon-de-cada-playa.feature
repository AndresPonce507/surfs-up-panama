@feature-f-know-how-much-to-trust-it
Feature: Cada playa dice por qué confiar en su número, hoy y mañana

  Un surfista mira el número y decide si maneja dos horas. Al lado va la
  confianza, y a un toque va la razón: la de ESA playa y ESE día, no una frase
  igual para las veinte. La razón nombra lo que de verdad topó el nivel, nunca
  una causa que no pesó, y nunca dice que alguien confirmó desde la playa,
  porque hoy no hay ni un reporte en el sistema.

  # ---------------------------------------------------------------------
  # La mitad del productor: qué frase se compone, con la mañana real
  # pasando por los puertos de ingesta y de armado. Ninguna frase sembrada
  # por la prueba puede satisfacer estos oráculos.
  # ---------------------------------------------------------------------

  @slice-01 @driving_port @in-memory @covers-R3 @covers-R4 @covers-R6 @covers-R7 @covers-R12
  Scenario: La razón nombra la marea que falta, porque es la que topó el nivel
    Given una mañana sin dato de marea, con los modelos pareciéndose entre ellos
    When esa mañana se arma y se publica
    Then la superficie que leen las páginas trae la razón de cada playa y cada día
    And cada razón nombra la marea que falta
    And ninguna razón culpa a los modelos de un desacuerdo que no hubo
    And cada razón cabe en ciento sesenta caracteres y no filtra nada del código

  @slice-01 @driving_port @in-memory @covers-R8 @covers-R9
  Scenario: La razón admite que nadie ha reportado y que no hay historial verificado
    Given una mañana sin dato de marea, con los modelos pareciéndose entre ellos
    When esa mañana se arma y se publica
    Then cada razón dice que todavía nadie ha reportado desde la playa
    And cada razón dice que este spot todavía no tiene historial verificado
    And ninguna razón publicada reclama ni sugiere una confirmación desde la playa

  @slice-01 @driving_port @in-memory @negative @error @covers-R14
  Scenario: Sin el dato de la marea nadie ve confianza alta, y la razón dice por qué
    Given una mañana sin dato de marea, con los modelos pareciéndose entre ellos
    When esa mañana se arma y se publica
    Then ninguna playa se publica con confianza alta
    And cada razón nombra la marea que falta

  @slice-01 @driving_port @in-memory @error @covers-R3 @covers-R4
  Scenario: Cuando el que manda es el desacuerdo de período, la razón lo dice y no culpa a la marea
    Given una mañana con el dato de la marea completo y los modelos partidos en el período
    When esa mañana se arma y se publica
    Then cada razón nombra el desacuerdo de período
    And ninguna razón nombra la marea

  @slice-01 @driving_port @in-memory @error @covers-R5
  Scenario: Un día en que solo respondió un modelo lo dice así, nunca como desacuerdo
    Given una mañana en la que solo respondió un modelo
    When esa mañana se arma y se publica
    Then cada razón dice que respondió un solo modelo
    And ninguna razón culpa a los modelos de un desacuerdo que no hubo

  # ---------------------------------------------------------------------
  # La mitad de la lectura: qué llega a los ojos del surfista, sobre el
  # sitio realmente construido y servido por HTTP, en Chromium a 390 px.
  # ---------------------------------------------------------------------

  @slice-01 @walking_skeleton @driving_port @real-io @adapter-integration @covers-R1 @covers-R2
  Scenario Outline: El surfista abre <lista> y lee la razón de su playa para ese día
    Given una mañana publicada donde cada playa trae su propia razón
    When el surfista abre "<lista>" y toca la confianza de cada fila
    Then cada fila abre la razón publicada para esa playa y ese día
    And dos playas con razones distintas no muestran el mismo texto

    Examples:
      | lista |
      | la lista de hoy |
      | la lista de mañana |

  @slice-01 @driving_port @real-io @adapter-integration @covers-R7 @covers-R12
  Scenario: La razón que se muestra es exactamente la publicada y cabe en el bolsillo
    Given una mañana publicada donde cada playa trae su propia razón
    When el surfista abre "la lista de hoy" y toca la confianza de cada fila
    Then ninguna razón mostrada pasa de ciento sesenta caracteres
    And ninguna razón mostrada agrega ni recorta nada de lo publicado
    And ninguna razón mostrada trae texto técnico, inglés ni rayas largas

  @slice-01 @driving_port @real-io @adapter-integration @negative @error @covers-R10
  Scenario: Una playa publicada sin razón muestra su nivel y calla, mientras la de al lado sí la trae
    Given una mañana publicada donde cada playa trae su propia razón
    When el surfista abre "la lista de hoy" y toca la confianza de cada fila
    Then la playa publicada sin razón muestra su palabra de confianza y no ofrece nada que abrir
    And en esa misma mañana la playa de al lado sí abre la suya

  @slice-01 @driving_port @real-io @adapter-integration @covers-R11
  Scenario: La página de la playa trae su nivel y su razón, hoy y mañana
    Given una mañana publicada donde cada playa trae su propia razón
    When el surfista abre la página de su playa y toca la confianza de cada día
    Then cada sección de día muestra su palabra de confianza
    And cada sección de día abre la razón publicada para ese día

  @slice-01 @driving_port @real-io @adapter-integration @error @covers-R39
  Scenario: Quien no distingue colores lee la confianza igual, por forma y palabra
    Given una mañana publicada donde cada playa trae su propia razón
    When el surfista abre "la lista de hoy" y toca la confianza de cada fila
    Then ningún color distingue un nivel de confianza de otro
    And cada nivel se lee por su forma además de su palabra

  @slice-01 @driving_port @real-io @adapter-integration @ui-u1 @ui-u2 @ui-u3 @ui-u4 @ui-u5 @ui-u6 @ui-u7 @covers-R33 @covers-R34 @covers-R35 @covers-R36 @covers-R37 @covers-R38
  Scenario Outline: La confianza de la página de la playa se lee limpia en el teléfono, tema <tema>, movimiento <movimiento>
    Given una mañana publicada donde cada playa trae su propia razón
    When el surfista abre la página de su playa a 390 px con tema "<tema>" y movimiento "<movimiento>"
    Then la confianza de cada día cumple las siete comprobaciones visuales sobre el fondo real

    Examples:
      | tema | movimiento |
      | claro | normal |
      | oscuro | reducido |
