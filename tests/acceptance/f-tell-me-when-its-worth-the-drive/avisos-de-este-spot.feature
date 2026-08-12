@feature-f-tell-me-when-its-worth-the-drive
Feature: Pedir avisos de un spot, y que el "listo" sea verdad

  Un surfista abre su playa y quiere que le avisen las mañanas que vale la pena
  manejar. Pide los avisos con un toque. Lo único que no puede pasar nunca es
  que la pantalla diga que está avisado cuando no lo está: el "listo" aparece
  solo cuando el navegador entregó una suscripción de verdad y el servidor ya
  la guardó. Si el permiso no se concede, si el teléfono no puede pedir avisos, o si
  el servidor no puede guardarla, la pantalla lo dice en palabras y se queda
  sin avisos, que es la verdad.

  Nota de alcance: ninguna escena de aquí toca las palabras de "Añadir a
  pantalla de inicio". Esa pieza está reclamada por dos planes a la vez y nadie
  ha decidido de quién es, así que este archivo no la afirma presente ni
  ausente.

  @slice-01 @walking_skeleton @driving_port @real-io @deploy-blocked @covers-R1 @covers-R2 @covers-R3 @covers-R4
  Scenario: El surfista pide avisos de Playa Venao y solo ve listo cuando el servidor ya los guardó
    Given la página de Playa Venao de la superficie publicada real, abierta en el teléfono a 390 px
    And el teléfono concede el permiso de avisos
    When el surfista toca el control de avisos de ese spot
    Then el navegador entrega una suscripción de avisos real para ese spot
    And el spot dice listo solo después de que el servidor confirmó que la guardó
    And antes de esa confirmación la página no muestra avisos activos

  @slice-01 @driving_port @real-io @negative @error @covers-R5 @covers-R4
  Scenario: Si el teléfono no concede el permiso, el spot se queda sin avisos y lo dice en palabras
    Given la página de Playa Venao de la superficie publicada real, abierta en el teléfono a 390 px
    And el teléfono no concede el permiso de avisos
    When el surfista toca el control de avisos de ese spot
    Then el spot dice en español que sin permiso no puede avisar
    And la página no muestra avisos activos
    And el spot no vuelve a pedir el permiso

  @slice-01 @driving_port @real-io @negative @error @covers-R6
  Scenario: Donde el teléfono no puede pedir avisos, no aparece un botón muerto
    Given la página de Playa Venao abierta a 390 px en un teléfono que no puede pedir avisos
    Then la página no ofrece ninguna acción para activar avisos
    And la página no muestra avisos activos

  @slice-01 @driving_port @real-io @negative @error @deploy-blocked @covers-R7
  Scenario: Si el servidor no puede guardar la suscripción, el spot sigue sin avisos y ofrece reintentar
    Given la página de Playa Venao de la superficie publicada real, abierta en el teléfono a 390 px
    And el teléfono concede el permiso de avisos
    And el servidor de suscripciones no puede guardarla en este momento
    When el surfista toca el control de avisos de ese spot
    Then el spot sigue sin avisos y ofrece intentar de nuevo
    And la suscripción no queda guardada para mandarla más tarde

  @slice-01 @driving_port @real-io @negative @error @deploy-blocked @covers-R8 @covers-R35
  Scenario: Un destino que el servicio no reconoce se explica en español llano, sin jerga
    Given la página de Playa Venao de la superficie publicada real, abierta en el teléfono a 390 px
    And el teléfono concede el permiso de avisos
    And el servidor de suscripciones no reconoce el destino de este navegador
    When el surfista toca el control de avisos de ese spot
    Then el spot explica en español que ese navegador no puede recibir avisos
    And ese texto no trae direcciones, ni códigos, ni palabras en inglés

  @slice-01 @driving_port @real-io @covers-R4
  Scenario: Al volver, el estado de avisos sale de la suscripción real del navegador
    Given la página de Playa Venao de la superficie publicada real, abierta en el teléfono a 390 px
    And una visita anterior dejó guardada una marca de avisos activos
    And el navegador no tiene ninguna suscripción de avisos para ese spot
    When el surfista vuelve a abrir la página de ese spot
    Then la página no muestra avisos activos

  @slice-01 @driving_port @real-io @deploy-blocked @covers-R9
  Scenario: Un toque quita los avisos y quitados quedan
    Given un surfista con avisos activos en Playa Venao
    When el surfista toca el control para quitar los avisos de ese spot
    Then la página vuelve a mostrarse sin avisos
    And a ese surfista no le vuelve a llegar ningún aviso de ese spot

  @slice-01 @driving_port @real-io @ui-u1 @ui-u2 @ui-u3 @ui-u4 @ui-u5 @ui-u6 @ui-u7 @covers-R28 @covers-R29 @covers-R30 @covers-R31 @covers-R32 @covers-R33 @covers-R34 @covers-R35
  Scenario Outline: El control de avisos se ve terminado en el teléfono, en los dos temas
    Given la página de Playa Venao abierta a 390 px con tema "<tema>" y movimiento "<movimiento>"
    Then el control de avisos cumple las siete comprobaciones visuales

    Examples:
      | tema   | movimiento |
      | claro  | normal     |
      | oscuro | reducido   |
