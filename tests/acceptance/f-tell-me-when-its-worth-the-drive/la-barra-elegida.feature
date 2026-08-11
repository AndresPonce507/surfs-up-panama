@feature-f-tell-me-when-its-worth-the-drive
Feature: La barra de aviso que elige cada surfista

  Cada surfista decide qué tan buena tiene que ser una mañana antes de que el
  teléfono valga la interrupción. La elección es un número entero de 0 a 100,
  queda exactamente como la eligió y al volver se lee de los avisos que de
  verdad siguen guardados, no de un recuerdo del teléfono.

  @slice-04 @driving_port @in-memory @covers-R43 @covers-R44
  Scenario Outline: La surfista guarda exactamente la barra que eligió y una mañana por debajo no la despierta
    Given una surfista de Playa Venao con avisos guardados elige la barra <barra>
    And en Playa Venao son las siete y veinticinco de la mañana
    When la mañana puntúa <puntaje>
    Then sus avisos guardados conservan exactamente la barra <barra>
    And no sale ningún aviso para esa surfista

    Examples:
      | barra | puntaje |
      | 0     | -1      |
      | 67    | 66      |
      | 100   | 99      |

  @slice-04 @driving_port @in-memory @covers-R43 @covers-R45
  Scenario: Una mañana que alcanza la barra elegida sí le avisa a esa surfista
    Given una surfista de Playa Venao con avisos guardados elige la barra 67
    And en Playa Venao son las siete y veinticinco de la mañana
    When la mañana puntúa 67
    Then sale exactamente un aviso para esa surfista

  @slice-04 @driving_port @in-memory @negative @error @covers-R43
  Scenario Outline: Una barra que no es un número entero dentro de la escala no cambia los avisos
    Given una surfista de Playa Venao con avisos guardados
    When intenta elegir la barra "<barra>"
    Then sus avisos guardados conservan la barra que tenían antes
    And la página le explica en español que elija un número entero entre 0 y 100

    Examples:
      | barra |
      | -1    |
      | 101   |
      | 67.5  |

  @slice-04 @driving_port @real-io @negative @error @deploy-blocked @requires_external @covers-R46
  Scenario: Al volver, la página no inventa una barra desde un recuerdo del teléfono
    Given una visita anterior dejó recordada la barra 88
    And los avisos guardados de verdad dicen que la barra es 67
    When la surfista vuelve a abrir Playa Venao
    Then la página muestra la barra 67
    And la página no muestra la barra 88

  @slice-04 @driving_port @real-io @ui-u1 @ui-u2 @ui-u3 @ui-u4 @ui-u5 @ui-u6 @ui-u7 @covers-R47
  Scenario Outline: Elegir la barra se ve terminado en el teléfono, en los dos temas
    Given Playa Venao está abierta a 390 px con tema "<tema>" y movimiento "<movimiento>"
    When la surfista abre la elección de su barra
    Then la elección de la barra cumple las siete comprobaciones visuales

    Examples:
      | tema   | movimiento |
      | claro  | normal     |
      | oscuro | reducido   |
