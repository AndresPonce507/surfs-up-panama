@feature-f-looks-like-the-ocean-and-reads-in-the-sun
Feature: La tabla de contraste dice lo mismo que la portada que un surfista realmente lee

  Una tabla de diseño no le sirve a nadie si describe el sitio de ayer. El surfista abre la
  portada bajo el sol, no el documento, pero el documento es la promesa que evita que una
  modificación futura vuelva ilegible la página sin que nadie se dé cuenta. La promesa tiene
  que nombrar el agua tropical que hoy se pinta, sus márgenes de lectura y el teléfono donde
  se comprueba.

  @slice-04 @step-04-01 @driving_port @real-io @ui-u1 @ui-u2 @ui-u3 @ui-u4 @ui-u5 @ui-u6 @ui-u7
  Scenario Outline: La tabla de contraste cuenta exactamente cómo se lee la portada publicada, en tema <tema>
    Given la tabla de contraste y la portada publicada están listas para compararse
    When el surfista abre para comparar la portada a 390 px, con tema "<tema>"
    Then la tabla nombra las parejas de lectura que la portada realmente pinta en tema "<tema>", con su proporción y su piso
    And la tabla no conserva los valores de la paleta gris que ya fue reemplazada
    And la portada cabe en el teléfono, conserva controles alcanzables y llega lista para leer
    And al pedir quietud, la portada no se mueve
    And las palabras de la portada conservan la escala y el ritmo que la tabla promete
    And los colores, espacios, bordes, sombras y movimiento que la portada usa tienen nombre en el sistema
    And la comprobación viaja por la misma revisión local que protege la publicación

    Examples:
      | tema   |
      | claro  |
      | oscuro |

  @slice-04 @step-04-01 @driving_port @real-io @negative @error @ui-u1
  Scenario: Una tabla corregida que vuelve a mostrar una pareja de la paleta gris se rechaza antes de publicar
    Given una copia aislada de la tabla corregida vuelve a guardar una pareja de la paleta gris reemplazada
    When esa tabla se compara con la portada publicada
    Then la comprobación rechaza la tabla nombrando el color gris viejo y la pareja tropical que falta

  @slice-04 @step-04-01 @driving_port @real-io @negative @error @ui-u1
  Scenario: Una tarjeta que vuelve a pintar un fondo inexistente se rechaza contra la portada construida
    Given la tabla de contraste y la portada publicada están listas para compararse
    When el surfista abre para comparar la portada a 390 px, con tema "claro"
    And una copia visual de la portada pinta el fondo de tarjeta claro que esta ruta no usa
    Then la comprobación rechaza el fondo de tarjeta claro no pintado

  @slice-04 @step-04-02 @driving_port @real-io @ui-u1 @ui-u2 @ui-u3 @ui-u4 @ui-u5 @ui-u6 @ui-u7
  Scenario: El sitio se recorre en el teléfono, en las dos maneras del tema, y cada palabra se lee con margen de sobra bajo el sol
    Given las rutas que el surfista puede abrir están listas para recorrer
    When el surfista las recorre a 390 px, con tema claro y oscuro, y pide quietud
    Then las palabras, los controles y el ancho de cada ruta publicada conservan un margen de lectura cómodo
    And la revisión local publica ese recorrido dentro de su aceptación de navegador sin inventar otra revisión

  @slice-04 @step-04-03 @driving_port @real-io @negative @error
  Scenario: Una pareja anotada que se separa de la página hace sonar la alarma y vuelve intacta
    Given la promesa de contraste publicada tiene su pareja clara de agua más exigente
    When una copia aislada anota esa pareja como menos legible de lo que la página pinta
    Then la alarma nombra la pareja de agua que dejó de coincidir
    And el documento publicado queda exactamente como estaba antes de probar la alarma
    And la revisión local termina sus comprobaciones de presentación y navegador sin omitir ninguna
