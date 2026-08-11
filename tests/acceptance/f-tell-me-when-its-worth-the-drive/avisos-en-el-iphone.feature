@feature-f-tell-me-when-its-worth-the-drive
Feature: Avisos en el iPhone, sin botones muertos

  En un iPhone, una pestaña abierta de Safari no puede pedir avisos: eso no es
  una opinión, es cómo funciona el teléfono. Lo único honesto que puede hacer
  la página ahí es no ofrecer un botón que no lleva a ninguna parte. Y desde el
  ícono instalado en la pantalla de inicio, donde los avisos sí son posibles,
  el mismo toque de siempre tiene que llegar hasta listo, con la misma regla de
  verdad: listo solo cuando el servidor ya guardó la suscripción.

  Nota de alcance: ninguna escena de aquí toca las palabras de "Añadir a
  pantalla de inicio". Esa pieza está reclamada por dos planes a la vez y nadie
  ha decidido de quién es; la recomendación registrada es que viaje con el
  carril de sin señal, con la condición de que sus palabras no se publiquen
  antes de que exista un camino real para suscribirse. Este archivo no la
  afirma presente ni ausente.

  Nota de contexto: el ícono instalado existe gracias al manifiesto y al
  service worker de otro carril; mientras esa pieza no llegue, el contexto
  instalado de estas escenas se arma en el arnés, y la comprobación en un
  iPhone de verdad queda en la lista de lanzamiento.

  @slice-02 @driving_port @real-io @negative @error @covers-R39
  Scenario: En una pestaña de Safari de iPhone no aparece ningún botón muerto de avisos
    Given la página de Playa Venao de la superficie publicada real, abierta a 390 px en una pestaña de iPhone que no puede pedir avisos
    Then la página no ofrece ninguna acción para activar avisos
    And la página no muestra avisos activos
    And la misma superficie sí ofrece la acción donde pedir avisos es posible

  @slice-02 @driving_port @real-io @deploy-blocked @covers-R39
  Scenario: Desde el ícono instalado, el mismo toque llega hasta listo
    Given la página de Playa Venao abierta desde el ícono instalado en la pantalla de inicio
    And el teléfono concede el permiso de avisos
    When el surfista toca el control de avisos de ese spot
    Then el navegador entrega una suscripción de avisos real para ese spot
    And el spot dice listo solo después de que el servidor confirmó que la guardó
    And antes de esa confirmación la página no muestra avisos activos

  @slice-02 @driving_port @real-io @negative @error @covers-R44
  Scenario: Si el teléfono instalado perdió la suscripción, la página no finge que sigue
    Given la página de Playa Venao abierta desde el ícono instalado en la pantalla de inicio
    And una visita anterior dejó guardada una marca de avisos activos
    And el navegador no tiene ninguna suscripción de avisos para ese spot
    When el surfista vuelve a abrir la página de ese spot
    Then la página no muestra avisos activos

  @slice-02 @driving_port @real-io @ui-u1 @ui-u2 @ui-u3 @ui-u4 @ui-u5 @ui-u6 @ui-u7 @covers-R45
  Scenario Outline: El control de avisos instalado se ve terminado en el teléfono, en los dos temas
    Given la página de Playa Venao abierta desde el ícono instalado a 390 px con tema "<tema>" y movimiento "<movimiento>"
    Then el control de avisos cumple las siete comprobaciones visuales

    Examples:
      | tema   | movimiento |
      | claro  | normal     |
      | oscuro | reducido   |
