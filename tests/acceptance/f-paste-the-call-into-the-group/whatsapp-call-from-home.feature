@feature-f-paste-the-call-into-the-group
Feature: Un toque en la home y el llamado del día queda listo para el grupo

  Un surfista que quiere avisarle al grupo antes de manejar toca la acción de
  WhatsApp de la tarjeta grande una sola vez. WhatsApp se abre con el llamado
  del día ya escrito en español, con la dirección del sitio incluida, y el
  botón sigue funcionando aunque JavaScript esté apagado.

  @slice-01 @walking_skeleton @driving_port @real-io @adapter-integration @contract-shape:installed-public-input @covers-R1 @covers-R4
  Scenario: Un toque abre WhatsApp con el llamado del día ya escrito
    Given una copia intacta de la mañana publicada instalada para compartir
    When el surfista abre la home para compartir a 390 px, con tema "claro" y movimiento "normal"
    Then los cinco campos del llamado están poblados para el mejor spot del día
    And la tarjeta grande ofrece una sola acción de WhatsApp que se toca una vez
    And el mensaje ya escrito trae el llamado completo: la fecha, el mejor spot con su puntaje, el tamaño y el viento, la ventana y la confianza
    And el mensaje termina con la dirección completa del sitio sellada con el build

  @slice-01 @driving_port @real-io @adapter-integration @ui-u5 @covers-R2 @covers-R24
  Scenario: Con JavaScript apagado el botón sigue siendo un enlace que funciona
    Given una copia intacta de la mañana publicada instalada para compartir
    When el surfista abre la home para compartir sin JavaScript a 390 px
    Then la acción de WhatsApp sigue presente como un enlace normal
    And ese enlace lleva el mismo mensaje completo que con JavaScript encendido

  @slice-01 @driving_port @real-io @adapter-integration @negative @error @covers-R1 @covers-R4 @covers-R28
  Scenario: El mensaje y la página cuentan la misma historia, sin texto técnico
    Given una copia intacta de la mañana publicada instalada para compartir
    When el surfista abre la home para compartir a 390 px, con tema "claro" y movimiento "normal"
    Then el spot y el puntaje del mensaje son exactamente los de la tarjeta grande
    And el mensaje no muestra nombres de modelos, campos técnicos, llaves de plantilla ni texto de relleno
    And la dirección dentro del mensaje nunca es relativa ni apunta a localhost

  @slice-01 @driving_port @real-io @adapter-integration @negative @covers-R3
  Scenario: La dirección del mensaje sigue a la configuración del sitio, nunca a un nombre fijo
    Given una copia de la mañana publicada apuntada a un dominio recién registrado
    When el surfista abre la home para compartir a 390 px, con tema "claro" y movimiento "normal"
    Then la dirección del mensaje deriva del sitio configurado en esa copia
    And el nombre del sitio original no aparece por ningún lado del mensaje

  @slice-01 @driving_port @real-io @adapter-integration @covers-R6
  Scenario: La acción de WhatsApp respeta el presupuesto del primer vuelo
    Given una copia intacta de la mañana publicada instalada para compartir
    When el surfista abre la home para compartir a 390 px, con tema "claro" y movimiento "normal"
    Then la tarjeta grande ofrece una sola acción de WhatsApp que se toca una vez
    And el documento de la home queda dentro de su techo del primer vuelo

  @slice-01 @driving_port @real-io @adapter-integration @ui-u2 @ui-u6 @covers-R21 @covers-R25
  Scenario: El nombre más largo de la costa cabe completo en el mensaje y en el botón
    Given una mañana publicada cuyo mejor spot es el del nombre más largo
    When el surfista abre la home para compartir a 390 px, con tema "claro" y movimiento "normal"
    Then el mensaje nombra ese spot completo con su puntaje
    And la acción de compartir cabe completa a 390 px sin recortes

  @slice-01 @driving_port @real-io @adapter-integration @ui-u1 @ui-u2 @ui-u3 @ui-u4 @ui-u5 @ui-u6 @ui-u7 @covers-R20 @covers-R21 @covers-R22 @covers-R23 @covers-R24 @covers-R25 @covers-R26
  Scenario Outline: La acción de compartir se ve terminada y respeta las preferencias del teléfono
    Given una copia intacta de la mañana publicada instalada para compartir
    When el surfista abre la home para compartir a 390 px, con tema "<tema>" y movimiento "<movimiento>"
    Then la acción de WhatsApp cumple las siete comprobaciones visuales de la superficie publicada

    Examples:
      | tema | movimiento |
      | claro | normal |
      | oscuro | reducido |
