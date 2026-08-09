@feature-daily-call-with-permanent-receipts
Feature: El llamado del día se entiende sin mirar dos veces

  Un surfista con pocos segundos para decidir necesita una sola respuesta.
  La tarjeta de arriba nombra el mejor spot, conserva su puntaje y explica
  tamaño, viento y hora en español de a pie.

  @slice-04 @driving_port @real-io @adapter-integration @contract-shape:assembled-surface @covers-R31
  Scenario: El mejor spot se convierte en un llamado que se puede repetir
    Given una mañana publicada cuyo mejor spot conserva tamaño, viento y ventana, con relato "completo"
    When el surfista abre la home publicada a 390 px, con tema "claro" y movimiento "normal"
    Then ve un solo llamado del día antes de las filas compactas
    And el llamado dice VE A, nombra el mejor spot y muestra su mismo puntaje
    And la razón nombra tamaño, viento y una ventana de horas en español

  @slice-04 @driving_port @real-io @adapter-integration @contract-shape:installed-public-input @covers-R31 @covers-R54
  Scenario: El llamado nace de la entrada pública instalada, no de un contrato paralelo
    Given una copia intacta de la mañana publicada instalada
    When el surfista abre la home publicada a 390 px, con tema "claro" y movimiento "normal"
    Then la razón nombra tamaño, viento y una ventana de horas en español
    And el llamado dice VE A, nombra el mejor spot y muestra su mismo puntaje

  @slice-04 @driving_port @real-io @adapter-integration @negative @error @contract-shape:assembled-surface @covers-R31
  Scenario: La tarjeta nunca contradice el primer lugar de la costa
    Given una mañana publicada cuyo mejor spot conserva tamaño, viento y ventana, con relato "completo"
    When el surfista abre la home publicada a 390 px, con tema "claro" y movimiento "normal"
    Then el destino y el puntaje del llamado son los del primer lugar de la lista
    And ningún segundo spot se presenta como otro llamado del día

  @slice-04 @driving_port @real-io @adapter-integration @negative @error @ui-u5 @covers-R31 @covers-R54
  Scenario Outline: Una razón vacía o técnica nunca llega a la tarjeta
    Given una mañana publicada cuyo mejor spot conserva tamaño, viento y ventana, con relato "<estado>"
    When el surfista abre la home publicada a 390 px, con tema "claro" y movimiento "normal"
    Then la tarjeta conserva una razón segura y repetible en español
    And la tarjeta no muestra nombres de modelos, campos internos ni texto vacío

    Examples:
      | estado |
      | vacío |
      | técnico |
      | técnico-disfrazado |

  @slice-04 @driving_port @real-io @adapter-integration @ui-u2 @ui-u6 @covers-R31 @covers-R51 @covers-R55
  Scenario: Un destino largo conserva su propia razón sin recortarse
    Given una mañana publicada con el perfil estructurado "nombre-largo" y relato "vacío"
    When el surfista abre la home publicada a 390 px, con tema "claro" y movimiento "normal"
    Then el destino y la razón reflejan ese perfil y caben completos en el teléfono

  @slice-04 @driving_port @real-io @adapter-integration @ui-u1 @ui-u2 @ui-u3 @ui-u4 @ui-u5 @ui-u6 @ui-u7 @covers-R50 @covers-R51 @covers-R52 @covers-R53 @covers-R54 @covers-R55 @covers-R56
  Scenario Outline: El llamado sigue terminado en el teléfono y respeta las preferencias
    Given una mañana publicada cuyo mejor spot conserva tamaño, viento y ventana, con relato "completo"
    When el surfista abre la home publicada a 390 px, con tema "<tema>" y movimiento "<movimiento>"
    Then el llamado cumple las siete comprobaciones visuales de la superficie publicada

    Examples:
      | tema | movimiento |
      | claro | normal |
      | oscuro | reducido |
