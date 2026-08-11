@feature-f-looks-like-the-ocean-and-reads-in-the-sun
Feature: La página de cada playa conserva el mismo agua tropical que la portada

  Un surfista que abre una playa no debe sentir que salió a otro producto. La página de hoy,
  sus números de mañana, el recibo de ayer y las pantallas que encuentra al reportar o al
  equivocarse de dirección conservan el mismo carácter azul-verde de la portada, sin adelantar
  la llamada que la persona todavía no ha dado.

  @slice-03 @step-03-01 @driving_port @real-io @ui-u1 @ui-u2 @ui-u3 @ui-u4 @ui-u5 @ui-u6 @ui-u7
  Scenario Outline: La página de un spot y su recibo de ayer se ven como el mismo producto que la portada, en tema <tema>
    Given el sitio de Playa Venao está listo para visitar
    When el surfista abre la página de Playa Venao y su recibo de ayer a 390 px, con tema "<tema>"
    Then las dos páginas conservan el agua tropical y el margen de lectura bajo el sol
    And la página de Playa Venao conserva sus llamados de hoy y mañana, su tamaño y su ventana
    And las dos páginas caben en el teléfono, conservan controles alcanzables y llegan listas
    And con el movimiento reducido activado, las dos páginas se quedan quietas

    Examples:
      | tema   |
      | claro  |
      | oscuro |

  @slice-03 @step-03-01 @driving_port @real-io @negative @error @ui-u1
  Scenario: Una tarjeta de Playa Venao pintada de otro color se rechaza antes de publicar
    Given una copia del sitio de Playa Venao con sus tarjetas pintadas de otro color
    When el surfista abre la página de Playa Venao y su recibo de ayer a 390 px, con tema "claro"
    Then la comprobación rechaza las tarjetas porque ya no conservan la paleta de la portada

  @slice-03 @step-03-02 @driving_port @real-io @ui-u1 @ui-u2 @ui-u3 @ui-u4 @ui-u5 @ui-u6 @ui-u7
  Scenario Outline: La página que no existe y las dos pantallas de reportar se ven como el mismo producto, en tema <tema>
    Given el sitio de Playa Venao y la página que no existe están listos para visitar
    When el surfista abre la página que no existe y las dos pantallas de reportar de Playa Venao en un teléfono estrecho, con tema "<tema>"
    Then las tres pantallas conservan el agua tropical, la lectura bajo el sol y una llegada honesta
    And los controles de reportar muestran la selección y la indisponibilidad sin depender solo del color
    And las pantallas de reportar no adelantan la llamada del pronóstico
    And con el movimiento reducido activado, las tres pantallas se quedan quietas

    Examples:
      | tema   |
      | claro  |
      | oscuro |

  @slice-03 @step-03-02 @driving_port @real-io @negative @error @ui-u5
  Scenario: Una playa inexistente que no explica qué pasó se rechaza antes de publicar
    Given una copia del sitio donde una playa inexistente no explica qué pasó
    When el surfista abre la página que no existe y las dos pantallas de reportar de Playa Venao en un teléfono estrecho, con tema "claro"
    Then la comprobación rechaza la página porque deja al surfista sin una explicación humana

  @slice-03 @step-03-02 @driving_port @real-io @negative @error
  Scenario: Una pantalla de reportar que adelanta la llamada se rechaza antes de publicar
    Given una copia del sitio donde reportar recibe la llamada del pronóstico antes de tiempo
    When el surfista abre la página que no existe y las dos pantallas de reportar de Playa Venao en un teléfono estrecho, con tema "claro"
    Then la comprobación rechaza las pantallas de reportar antes de que adelanten la llamada

  @slice-03 @driving_port @real-io @ui-u1 @ui-u2 @ui-u4 @ui-u5 @ui-u6 @ui-u7
  Scenario Outline: Cada pantalla publicada conserva el mismo producto al recorrer el sitio entero, en tema <tema>
    Given la construcción completa del sitio está lista para recorrer
    When el surfista recorre cada pantalla que publicó el sitio a 390 px, con tema "<tema>"
    Then cada pantalla conserva el agua tropical, una lectura clara y una llegada completa
    And el recorrido nombra cuántas pantallas de playa, ayer, mañana, reportar, reportado y dirección desconocida inspeccionó
    And ninguna pantalla publicada queda fuera del recorrido

    Examples:
      | tema   |
      | claro  |
      | oscuro |

  @slice-03 @driving_port @real-io @negative @error @ui-u5
  Scenario: Una publicación sin pantallas para inspeccionar se rechaza antes de anunciar el recorrido
    Given una publicación sin ninguna pantalla para recorrer
    When el surfista pide el recuento de las pantallas publicadas
    Then la comprobación rechaza el recorrido porque inspeccionó cero pantallas
