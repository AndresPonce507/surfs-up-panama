@feature-f-looks-like-the-ocean-and-reads-in-the-sun
Feature: Cada fila se lee de un vistazo por su barra y su confianza se entiende por forma y palabra

  La surfista recorre las listas de hoy y mañana bajo el sol. La barra hace visible el tamaño
  relativo de cada puntaje sin cambiarlo ni usar un segundo significado de color. La confianza
  conserva su palabra completa y suma puntos llenos y vacíos, para que siga siendo comprensible
  cuando el color de la pantalla no ayuda.

  @slice-05 @step-05-01 @driving_port @real-io @ui-u1 @ui-u2 @ui-u3 @ui-u4 @ui-u5 @ui-u6 @ui-u7
  Scenario: Cada puntaje conserva su lugar y gana una barra proporcional, sin otro significado de color
    Given la costa publicada está lista para leer
    When la surfista recorre las listas de hoy y mañana a 390 px, con los dos temas
    Then cada puntaje publicado conserva su número y obtiene una barra proporcional a su propio valor
    And las barras se distinguen por longitud, se leen sobre su fondo y no cambian el orden ni el fondo de las playas
    And las barras no añaden una acción ni movimiento, y la lista conserva su ritmo y su ancho en el teléfono
    And las listas llegan completas con las medidas nombradas del producto

  @slice-05 @step-05-02 @driving_port @real-io @ui-u1 @ui-u2 @ui-u3 @ui-u4 @ui-u5 @ui-u6 @ui-u7
  Scenario: La confianza conserva su palabra y suma puntos que se entienden sin color
    Given la costa publicada está lista para leer
    When la surfista recorre las listas de hoy y mañana a 390 px, con los dos temas
    Then cada confianza publicada conserva su palabra completa y muestra sus puntos correspondientes
    And los puntos y las palabras se leen igual sin usar el color para separar los niveles
    And la confianza sigue siendo un toque alcanzable, no añade movimiento y la lista cabe en el teléfono
    And las listas llegan completas con las medidas nombradas del producto

  @slice-05 @step-05-01 @driving_port @real-io @negative @error
  Scenario: Una lista que pierde sus barras se rechaza antes de presentarse
    Given una costa publicada a la que se le quitan las barras
    When la surfista recorre las listas de hoy y mañana a 390 px, con los dos temas
    Then la comprobación rechaza las filas que pierden su barra proporcional

  @slice-05 @step-05-02 @driving_port @real-io @negative @error
  Scenario: Una lista que pierde los puntos de confianza se rechaza antes de presentarse
    Given una costa publicada a la que se le quitan los puntos de confianza
    When la surfista recorre las listas de hoy y mañana a 390 px, con los dos temas
    Then la comprobación rechaza las filas que pierden los puntos de confianza

  @slice-05 @step-05-03 @driving_port @real-io @ui-u1 @ui-u2 @ui-u4 @ui-u5 @ui-u6 @ui-u7
  Scenario: El recorrido completo mantiene la historia de los puntajes aun cuando el color no ayuda
    Given la costa publicada está lista para leer
    When la surfista recorre las listas de hoy y mañana a 390 px, con los dos temas
    Then cada puntaje publicado conserva su número y obtiene una barra proporcional a su propio valor
    And cada confianza publicada conserva su palabra completa y muestra sus puntos correspondientes
    And las barras se distinguen por longitud, se leen sobre su fondo y no cambian el orden ni el fondo de las playas
    And los puntos y las palabras se leen igual sin usar el color para separar los niveles
    And la misma historia se conserva cuando se quita el matiz de los colores
