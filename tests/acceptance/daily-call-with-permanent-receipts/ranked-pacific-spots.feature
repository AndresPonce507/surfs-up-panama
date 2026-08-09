@feature-daily-call-with-permanent-receipts
Feature: La costa del Pacífico ordenada para decidir

  Un surfista compara la costa antes de salir. Ve los veinte spots reales del
  lanzamiento, en el orden que hoy marca el mar. La lista viene de datos: una
  corrección de datos cambia la lista sin esconder una nueva regla en código.

  @slice-03 @driving_port @in-memory @contract-shape:bounded-change @covers-R30 @covers-R37
  Scenario: Antes de salir, el surfista ve los veinte spots reales del lanzamiento
    Given existe una política publicada para el lanzamiento del Pacífico
    When la mañana del Pacífico se publica para la home
    Then la publicación de la home contiene exactamente los veinte spots publicados
    And cada spot publicado conserva su identidad de datos

  @slice-03 @driving_port @in-memory @negative @error @contract-shape:bounded-change @covers-R30 @covers-R37
  Scenario: Ningún spot del mapa fuente desaparece sin una decisión publicada
    Given existe una política publicada para el lanzamiento del Pacífico
    When la mañana del Pacífico se publica para la home
    Then la publicación de la home contiene exactamente los veinte spots publicados
    And los veintitrés spots fuente quedan repartidos entre los veinte publicados y tres exclusiones nombradas
    And ningún spot excluido llega a la publicación de la home

  @slice-03 @driving_port @in-memory @negative @error @contract-shape:bounded-change @covers-R30 @covers-R37
  Scenario Outline: La home se niega a publicar una costa incompleta
    Given existe una política aislada con <cantidad> spots de lanzamiento
    When la mañana del Pacífico intenta publicarse con esa política
    Then la home rechaza la política incompleta y no muestra una costa parcial

    Examples:
      | cantidad |
      | 0 |
      | 1 |

  @slice-03 @driving_port @in-memory @contract-shape:bounded-change @covers-R30
  Scenario: La home ordena toda la costa del mejor puntaje al peor
    Given existe una política publicada para el lanzamiento del Pacífico
    When la mañana del Pacífico se publica para la home
    Then la publicación de la home contiene las veinte filas de lanzamiento
    And ningún puntaje mayor aparece debajo de un puntaje menor
    And cada fila trae un llamado en español para el surfista

  @slice-03 @driving_port @in-memory @negative @contract-shape:bounded-change @covers-R30
  Scenario: Un cambio de dirección del swell cambia el orden de la costa
    Given existe una política publicada para el lanzamiento del Pacífico
    When el swell gira entre dos mañanas publicadas
    Then las dos mañanas tienen las veinte filas de lanzamiento
    And las dos mañanas no conservan el mismo orden de spots
