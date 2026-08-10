@feature-f-tell-me-when-its-worth-the-drive
Feature: Encontrar el camino honesto a los avisos en iPhone

  En Safari, un surfista no puede encender avisos desde una pestaña abierta.
  La página no le ofrece un botón que no puede cumplir: le explica el camino
  real, Compartir y luego Añadir a pantalla de inicio. Desde el icono que
  instala, encuentra el mismo control de avisos que ya funciona para quien sí
  puede pedirlos. La pantalla no llama "listo" a nada que no haya quedado
  guardado de verdad.

  @slice-02 @driving_port @real-io @negative @error @covers-R39 @covers-R40
  Scenario: Safari explica cómo llegar a los avisos sin ofrecer un botón muerto
    Given Playa Venao está abierta a 390 px en Safari sin avisos disponibles
    Then la página muestra exactamente el camino de iPhone para recibir avisos
    And Safari no ofrece una acción para encender avisos
    And la misma página sí ofrece la acción cuando el teléfono puede pedir avisos

  @slice-02 @driving_port @real-io @covers-R39
  Scenario: El surfista que abre el icono instalado encuentra la misma entrada de avisos
    Given un surfista abre Playa Venao desde el icono que instaló a 390 px
    Then encuentra una acción para pedir avisos de ese spot
    And la página todavía no dice que los avisos estén activos

  @slice-02 @driving_port @real-io @negative @error @covers-R39
  Scenario: El icono instalado no finge que los avisos ya están encendidos
    Given un surfista vuelve a Playa Venao desde el icono que instaló
    And no hay una suscripción real de avisos en ese teléfono
    Then la página no dice que los avisos estén activos
    And ofrece la acción para pedirlos

  @slice-02 @driving_port @real-io @deploy-blocked @requires-real-device @covers-R39
  Scenario: Desde el icono instalado el surfista ve listo solo después de guardar los avisos
    Given un surfista abre Playa Venao desde el icono que instaló a 390 px
    And el teléfono concede el permiso de avisos desde el icono instalado
    When el surfista pide avisos de Playa Venao desde el icono instalado
    Then el icono no dice listo antes de que el servidor guarde los avisos

  @slice-02 @driving_port @real-io @ui-u1 @ui-u2 @ui-u3 @ui-u4 @ui-u5 @ui-u6 @ui-u7 @covers-R44 @covers-R45 @covers-R46 @covers-R47 @covers-R48 @covers-R49 @covers-R50
  Scenario: El camino de iPhone se ve terminado a 390 px en los dos temas
    Given Playa Venao está abierta a 390 px en Safari sin avisos disponibles
    Then el camino de iPhone cumple las siete comprobaciones visuales en tema claro y oscuro
