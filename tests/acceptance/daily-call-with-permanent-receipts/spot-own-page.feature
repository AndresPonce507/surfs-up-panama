@feature-daily-call-with-permanent-receipts
Feature: Cada spot tiene su propia página, con lo suyo y no lo de otro

  Un surfista no va a la mejor playa del país, va a la suya. Cualquier spot que
  toque desde la lista, el mejor o el más flojo, abre su propia página con su
  nombre, sus números de hoy y de mañana, el tamaño en palabras del cuerpo con
  el rango en metros al lado, y la mejor ventana para ir. Nunca un error crudo,
  nunca una página en blanco, nunca un metro exacto y pelado, y siempre un
  camino de vuelta a la lista.

  @slice-06 @driving_port @real-io @adapter-integration @negative @error @covers-R33
  Scenario: Una dirección de spot mal escrita nunca muestra un error crudo ni la lista de otro spot
    Given una superficie publicada real, sin modificar
    When el surfista escribe mal la dirección de un spot y la abre a 390 px
    Then la página dice en español que esa playa no existe, sin error crudo ni texto en blanco
    And la página ofrece un camino de vuelta a la lista, y no es silenciosamente la propia lista

  @slice-06 @driving_port @real-io @adapter-integration @covers-R33
  Scenario Outline: El spot tocado abre su propia página con sus números de hoy y de mañana, tamaño y ventana
    Given una superficie publicada con perfiles de tamaño y ventana distintos para dos spots
    When el surfista toca "<perfil>" desde la lista de hoy y abre su página a 390 px
    Then la página nombra ese spot y no otro
    And el puntaje de hoy en la página es el mismo que su fila de hoy en la lista
    And el puntaje de mañana en la página es el mismo que su fila de mañana en la lista de mañana
    And el tamaño de hoy y de mañana aparecen como palabra del cuerpo primero y luego "≈" con un rango en metros
    And la ventana de hoy y de mañana aparecen como "Ventana" con hora de inicio y de fin

    Examples:
      | perfil |
      | primera-luz |
      | medio-flojo |

  @slice-06 @driving_port @real-io @adapter-integration
  Scenario: Dos spots distintos no repiten sospechosamente los mismos datos
    Given una superficie publicada con perfiles de tamaño y ventana distintos para dos spots
    When el surfista abre la página de "primera-luz" y luego la de "medio-flojo" a 390 px
    Then el tamaño de hoy de un spot no es igual al tamaño de hoy del otro
    And la ventana de hoy de un spot no es igual a la ventana de hoy del otro

  @slice-06 @driving_port @real-io @adapter-integration @negative @error
  Scenario: Los metros nunca aparecen como un número exacto y pelado
    Given una superficie publicada con perfiles de tamaño y ventana distintos para dos spots
    When el surfista abre la página de "primera-luz" y luego la de "medio-flojo" a 390 px
    Then ninguna de las dos páginas muestra un valor de metros exacto y sin "≈" ni rango

  @slice-06 @driving_port @real-io @adapter-integration @negative @error
  Scenario: Ningún spot, ni el más flojo, muestra un error crudo o queda en blanco
    Given una superficie publicada real, sin modificar
    When el surfista abre la página del spot más flojo de la lista a 390 px
    Then la página nombra ese spot y trae sus números reales de hoy y de mañana
    And donde falta tamaño o ventana la página lo dice en palabras, sin error crudo ni texto en blanco

  @slice-06 @driving_port @real-io @adapter-integration @ui-u2 @ui-u3
  Scenario: La página del spot se lee en el teléfono y vuelve a la lista sin perderse
    Given una superficie publicada con perfiles de tamaño y ventana distintos para dos spots
    When el surfista abre la página de "primera-luz" a 390 px
    Then nada se corta ni se encima en 390 px
    And el camino de vuelta mide al menos 44 por 44 px
    When el surfista toca el camino de vuelta
    Then el surfista está de nuevo en la lista de hoy

  @slice-06 @driving_port @real-io @adapter-integration @ui-u1 @ui-u4 @ui-u5 @ui-u6 @ui-u7
  Scenario Outline: La página del spot cumple las comprobaciones visuales en ambos temas
    Given una superficie publicada con perfiles de tamaño y ventana distintos para dos spots
    When el surfista abre la página de "primera-luz" a 390 px, con tema "<tema>" y movimiento "<movimiento>"
    Then la página del spot cumple las siete comprobaciones visuales

    Examples:
      | tema | movimiento |
      | claro | normal |
      | oscuro | reducido |
