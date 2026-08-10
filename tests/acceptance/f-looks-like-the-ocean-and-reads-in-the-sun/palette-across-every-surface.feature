@feature-f-looks-like-the-ocean-and-reads-in-the-sun
Feature: La página de cada playa conserva el mismo agua tropical que la portada

  Un surfista que abre una playa no debe sentir que salió a otro producto. La página de hoy,
  sus números de mañana y el recibo de ayer conservan el mismo carácter azul-verde de la
  portada, sin perder las palabras que le sirven para decidir si va a manejar hasta allí.

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
