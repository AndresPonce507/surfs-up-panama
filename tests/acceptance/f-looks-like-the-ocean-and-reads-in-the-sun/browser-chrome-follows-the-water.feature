@feature-f-looks-like-the-ocean-and-reads-in-the-sun
Feature: La barra del navegador y la app abierta siguen el agua tropical de la página

  Cuando una surfista abre el sitio desde el navegador o desde el icono instalado, el borde del
  teléfono no puede volver al blanco y negro del producto anterior mientras la página ya muestra
  agua tropical. La pantalla clara y la oscura siguen cada una el fondo que la persona realmente
  ve. La instalación conserva el fondo claro de entrada que un manifiesto único puede declarar;
  la página publicada conserva la decisión oscura cuando el teléfono la pide. Ningún número,
  palabra, ruta, tamaño de página ni acción del sitio cambia por este arreglo.

  @slice-06 @step-06-01 @driving_port @real-io @ui-u1 @ui-u2 @ui-u3 @ui-u4 @ui-u5 @ui-u6 @ui-u7
  Scenario: La surfista abre la portada y su app instalada con el borde del teléfono coherente en los dos temas
    Given la superficie publicada real está construida sin modificarla
    When la surfista abre la portada publicada con el teléfono claro y con el teléfono oscuro
    Then el borde claro del navegador y el fondo de entrada de la app coinciden con el fondo claro publicado
    And el borde oscuro del navegador coincide con el fondo oscuro publicado
    And el manifiesto publicado conserva sus dos colores de entrada como la misma decisión clara publicada
    And ninguna fuente de la barra del navegador ni del manifiesto guarda un color de superficie por su cuenta
    And la construcción conserva el límite de peso de cada página y no cambia números, palabras ni rutas

  @slice-06 @step-06-01 @driving_port @real-io @negative @error @ui-u7
  Scenario: Un borde del navegador que abandona el agua tropical se rechaza antes de publicar
    Given una copia publicada cuyo borde claro del navegador abandona el agua tropical
    When la surfista abre la portada publicada con el teléfono claro
    Then la comprobación rechaza el borde claro alterado y nombra el fondo tropical que debía conservar
