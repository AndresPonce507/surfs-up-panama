@feature-f-looks-like-the-ocean-and-reads-in-the-sun
Feature: La portada se ve como agua tropical profunda, no como una lista gris, y cada palabra sigue leyéndose bajo el sol

  El surfista abre la portada al amanecer o al mediodía, en el tema que traiga el teléfono. Detrás
  de la tarjeta del spot destacado el fondo pasa de una lista casi blanca a agua tropical profunda.
  La lista de playas más abajo se mantiene clara y de alto contraste: la profundidad es una banda
  detrás de la tarjeta destacada, nunca el fondo de toda la pantalla. Cada palabra del cuerpo, en
  la tarjeta y en la lista, sigue leyéndose con margen de sobra bajo el sol, y nada de esto cambia
  ningún número, palabra o ruta del sitio.

  @slice-01 @step-01-01 @walking_skeleton @driving_port @real-io @ui-u7
  Scenario Outline: La tarjeta destacada se ve como agua tropical profunda y la lista se mantiene clara, en tema <tema>
    Given la superficie publicada real, sin modificar
    When el surfista abre la portada a 390 px, con tema "<tema>"
    Then el fondo de la tarjeta destacada es el degradado de agua tropical profundo del sistema de diseño, no la lista casi blanca de antes
    And el fondo de las filas de la lista, debajo de la tarjeta destacada, se mantiene claro y distinto del fondo de la tarjeta
    And ningún color de la interfaz aparece fuera de los tokens con nombre

    Examples:
      | tema   |
      | claro  |
      | oscuro |

  @slice-01 @step-01-01 @driving_port @real-io @negative @error
  Scenario: Un build que oscurece toda la portada igual que la tarjeta destacada se rechaza
    Given una copia aislada de la portada cuyo fondo de página se oscurece igual que la tarjeta destacada
    When esa copia se abre a 390 px, con tema "claro"
    Then la comprobación de banda-no-página falla nombrando el fondo medido de las filas de la lista

  @slice-01 @step-01-01 @driving_port @real-io @negative @error @ui-u7
  Scenario: Un componente que introduce un color fuera de los tokens con nombre se rechaza
    Given una copia aislada cuyo archivo de componentes introduce un color fuera de los tokens con nombre
    When esa copia se reconstruye
    Then la comprobación de tokens falla nombrando el archivo y el color que no viene de un token

  @slice-01 @step-01-02 @driving_port @real-io @ui-u1
  Scenario Outline: Cada pareja de la ADR se vuelve a medir contra el fondo real de la tarjeta destacada, muestreado como se renderiza, en tema <tema>
    Given la superficie publicada real, sin modificar
    When el surfista abre la portada a 390 px, con tema "<tema>"
    Then cada texto de la tarjeta destacada se mide contra el fondo real muestreado del degradado, incluido su punto más claro interpolado
    And el texto del cuerpo despeja 7 a 1, todo el texto despeja 4.5 a 1
    And una pareja que no despeja se nombra con su proporción exacta y sus dos valores hexadecimales, nunca redondeada

    Examples:
      | tema   |
      | claro  |
      | oscuro |

  @slice-01 @step-01-02 @driving_port @real-io @negative @error
  Scenario: El texto de la tarjeta destacada en tema claro hereda el color pensado para fondos claros y pierde el margen de lectura contra el degradado oscuro
    Given la superficie publicada real, sin modificar
    When el surfista abre la portada a 390 px, con tema "claro"
    Then el texto del cuerpo de la tarjeta destacada no despeja 7 a 1 contra su fondo real, y la medición nombra el color y la proporción exactos

  @slice-01 @step-01-02 @driving_port @real-io @negative @error
  Scenario: Aclarar el punto más claro del degradado del tema oscuro por debajo de su piso se detecta, y la corrección se revierte sin dejar rastro
    Given el valor real de tokens.css en disco, capturado antes de tocarlo
    When el punto más claro del degradado del tema oscuro se aclara a "#0D5E6A", por debajo de su piso, y la portada se reconstruye
    Then la medición de contraste en tema "oscuro" falla nombrando la proporción y el valor exacto que no despeja
    When el valor de tokens.css se revierte a su original
    Then git diff confirma que tokens.css no deja ningún rastro del cambio

  @slice-01 @driving_port @real-io @ui-u2 @ui-u6
  Scenario Outline: Nada se sale de la pantalla ni se corta a <ancho> px, con el nombre de playa más largo, en tema <tema>
    Given la superficie publicada real, sin modificar
    When el surfista abre la portada a <ancho> px, con tema "<tema>"
    Then ninguna fila se desborda el ancho de la pantalla ni recorta el nombre de playa más largo
    And no hay scroll horizontal en ningún punto de la portada

    Examples:
      | ancho | tema   |
      | 390   | claro  |
      | 390   | oscuro |
      | 320   | claro  |
      | 320   | oscuro |

  @slice-01 @driving_port @real-io @ui-u4
  Scenario: Con el movimiento reducido activado, nada en la portada se mueve
    Given la superficie publicada real, sin modificar
    When el surfista abre la portada a 390 px, con tema "claro" y movimiento "reducido"
    Then ni la tarjeta destacada ni ninguna fila de la lista tienen transición o animación activa

  @slice-01 @driving_port @real-io
  Scenario: El contenido de la portada no cambia: cada spot y puntaje siguen siendo los de la superficie publicada real
    Given la superficie publicada real, sin modificar
    When el surfista abre la portada a 390 px, con tema "claro"
    Then cada fila de la lista muestra el mismo spot y el mismo puntaje que la superficie publicada real, en el mismo orden
