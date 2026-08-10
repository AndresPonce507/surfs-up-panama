@feature-f-paste-the-call-into-the-group
Feature: Un toque y el llamado queda en el portapapeles

  El mismo llamado que abre WhatsApp queda en el portapapeles con un solo
  toque, para pegarlo en el grupo, en un privado o donde el surfista quiera.
  La mejora nunca reemplaza el piso: sin permiso o sin JavaScript, la acción
  de WhatsApp de siempre sigue ahí y la página dice la verdad de lo que pasó.

  @slice-02 @driving_port @real-io @adapter-integration @covers-R7
  Scenario: Un toque deja el llamado completo en el portapapeles
    Given una copia intacta de la mañana publicada instalada para compartir
    When el surfista abre la home para compartir a 390 px, con tema "claro" y movimiento "normal"
    And toca la acción de copiar el llamado
    Then el portapapeles guarda exactamente el mismo llamado completo que lleva la acción de WhatsApp
    And la página confirma a la vista, en español sencillo, que el llamado ya está copiado

  @slice-02 @driving_port @real-io @adapter-integration @error @ui-u5 @covers-R9 @covers-R24
  Scenario: Si el teléfono niega el portapapeles, la página lo dice claro y WhatsApp sigue ahí
    Given una copia intacta de la mañana publicada instalada para compartir
    When el surfista abre la home para compartir a 390 px con el portapapeles negado
    And toca la acción de copiar el llamado
    Then la página avisa a la vista, en español sencillo, que copiar no salió
    And el portapapeles queda sin el llamado
    And la acción de WhatsApp sigue ofrecida como salida

  @slice-02 @driving_port @real-io @adapter-integration @error @covers-R7 @covers-R27
  Scenario: Copiar funciona sin señal, porque compartir no depende de ningún servidor
    Given una copia intacta de la mañana publicada instalada para compartir
    When el surfista abre la home para compartir a 390 px, con tema "claro" y movimiento "normal"
    And se queda sin señal
    And toca la acción de copiar el llamado
    Then el portapapeles guarda exactamente el mismo llamado completo que lleva la acción de WhatsApp
    And copiar no pidió nada por la red

  @slice-02 @driving_port @real-io @adapter-integration @error @ui-u5 @covers-R8 @covers-R24
  Scenario: La mejora de copiar viaja liviana y nunca reemplaza el piso
    Given una copia intacta de la mañana publicada instalada para compartir
    When el surfista abre la home para compartir a 390 px, con tema "claro" y movimiento "normal"
    Then la tarjeta grande ofrece la acción de copiar el llamado
    And la mejora de copiar pesa a lo sumo lo acordado y nunca frena el primer pintado
    And el documento de la home queda dentro de su techo del primer vuelo
    And sin JavaScript el ancla de WhatsApp sigue y ningún botón muerto se ofrece

  @slice-02 @driving_port @real-io @adapter-integration @ui-u1 @ui-u2 @ui-u3 @ui-u4 @ui-u5 @ui-u6 @ui-u7 @covers-R20 @covers-R21 @covers-R22 @covers-R23 @covers-R24 @covers-R25 @covers-R26
  Scenario Outline: La acción de copiar se ve terminada y respeta las preferencias del teléfono
    Given una copia intacta de la mañana publicada instalada para compartir
    When el surfista abre la home para compartir a 390 px, con tema "<tema>" y movimiento "<movimiento>"
    Then la acción de copiar cumple las siete comprobaciones visuales de la superficie publicada

    Examples:
      | tema | movimiento |
      | claro | normal |
      | oscuro | reducido |
