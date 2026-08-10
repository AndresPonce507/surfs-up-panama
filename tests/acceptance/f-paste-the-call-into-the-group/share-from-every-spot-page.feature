@feature-f-paste-the-call-into-the-group
Feature: Cada página de spot comparte su propio llamado

  Un surfista parado en la página de cualquier spot toca una vez y comparte
  el llamado de ese spot: su nombre, su puntaje, sus condiciones y el enlace
  a su propia página. El anuncio del enlace nombra ese spot, nunca los
  números de la portada. Misma acción, misma plantilla, mismo anuncio, a
  escala de un solo spot.

  @slice-05 @driving_port @real-io @adapter-integration @covers-R18
  Scenario: Desde la página de un spot se comparte el llamado de ese spot
    Given una copia intacta de la mañana publicada instalada para compartir
    When el surfista abre la página del segundo spot del día a 390 px, con tema "claro" y movimiento "normal"
    Then esa página ofrece una sola acción de WhatsApp con el llamado de ese spot ya escrito
    And ese mensaje trae el nombre, el puntaje y las condiciones de ese spot
    And el mensaje termina con la dirección de la página de ese spot sellada con el build

  @slice-05 @driving_port @real-io @adapter-integration @covers-R18
  Scenario: Copiar en la página del spot copia el llamado de ese spot
    Given una copia intacta de la mañana publicada instalada para compartir
    When el surfista abre la página del segundo spot del día a 390 px, con tema "claro" y movimiento "normal"
    And toca la acción de copiar el llamado
    Then el portapapeles guarda exactamente el llamado de ese spot que lleva su acción de WhatsApp

  @slice-05 @driving_port @real-io @adapter-integration @negative @covers-R18
  Scenario: El llamado del spot nunca cuenta la historia de la portada
    Given una copia intacta de la mañana publicada instalada para compartir
    When el surfista abre la página del segundo spot del día a 390 px, con tema "claro" y movimiento "normal"
    Then el mensaje de esa página nombra a ese spot y nunca al mejor del día
    And el anuncio de esa página declara ese spot con su puntaje, nunca los de la portada

  @slice-05 @driving_port @real-io @adapter-integration @error @covers-R18
  Scenario: Sin JavaScript la página del spot sigue compartiendo con un enlace normal
    Given una copia intacta de la mañana publicada instalada para compartir
    When el surfista abre la página del segundo spot del día sin JavaScript a 390 px
    Then la acción de WhatsApp de esa página sigue presente como un enlace normal con el llamado de ese spot

  @slice-05 @driving_port @real-io @adapter-integration @covers-R19
  Scenario: La página del spot con su acción de compartir sigue liviana
    Given una copia intacta de la mañana publicada instalada para compartir
    When el surfista abre la página del segundo spot del día a 390 px, con tema "claro" y movimiento "normal"
    Then esa página ofrece una sola acción de WhatsApp con el llamado de ese spot ya escrito
    And la página del spot queda dentro de su techo del primer vuelo

  @slice-05 @driving_port @real-io @adapter-integration @ui-u1 @ui-u2 @ui-u3 @ui-u4 @ui-u5 @ui-u6 @ui-u7 @covers-R20 @covers-R21 @covers-R22 @covers-R23 @covers-R24 @covers-R25 @covers-R26
  Scenario Outline: Las acciones de compartir del spot se ven terminadas y respetan las preferencias del teléfono
    Given una copia intacta de la mañana publicada instalada para compartir
    When el surfista abre la página del segundo spot del día a 390 px, con tema "<tema>" y movimiento "<movimiento>"
    Then las dos acciones de compartir del spot cumplen las siete comprobaciones visuales de la superficie publicada

    Examples:
      | tema | movimiento |
      | claro | normal |
      | oscuro | reducido |
