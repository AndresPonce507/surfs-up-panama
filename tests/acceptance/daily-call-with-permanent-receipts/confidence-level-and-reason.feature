@feature-daily-call-with-permanent-receipts
Feature: Cada fila trae su nivel de confianza y la razón a un toque

  Un surfista decide cuánto apostarle al número antes de manejar dos horas.
  Cada fila, hoy y mañana, dice su nivel de confianza con la palabra al lado.
  La razón se abre ahí mismo, honesta: es acuerdo entre modelos, nunca una
  playa confirmando nada, porque hoy no hay ni un reporte en el sistema.

  @slice-07 @driving_port @real-io @adapter-integration @contract-shape:confidence-disclosure @covers-R33
  Scenario Outline: Cada fila de <dia> trae su nivel de confianza visible en palabras junto al puntaje
    Given una mañana publicada con spots de confianza alta, media y baja para hoy y mañana
    When el surfista abre <ruta> publicada a 390 px, con tema "claro" y movimiento "normal"
    Then cada fila muestra la palabra de su nivel de confianza junto al puntaje, nunca solo como color

    Examples:
      | dia | ruta |
      | Hoy | la home |
      | Mañana | Mañana |

  @slice-07 @driving_port @real-io @adapter-integration @negative @error @contract-shape:confidence-disclosure @covers-R33
  Scenario: La razón se abre con un toque y es honesta sobre el acuerdo entre modelos y la falta de reportes desde la playa
    Given una mañana publicada con spots de confianza alta, media y baja para hoy y mañana
    When el surfista abre la home publicada a 390 px, con tema "claro" y movimiento "normal"
    And el surfista toca la razón de confianza de cada fila
    Then la razón de cada fila explica qué tanto acuerdan los modelos, en palabras que un surfista entiende
    And la razón de cada fila dice que todavía nadie reportó desde la playa
    And ninguna razón reclama ni sugiere una confirmación desde la playa
    And ninguna razón abre vacía ni con texto crudo de datos

  @slice-07 @driving_port @real-io @adapter-integration @ui-u2 @ui-u3 @ui-u4 @ui-u6 @covers-R33
  Scenario: Con la confianza sumada, las filas del teléfono siguen limpias y ambas señales se leen sin esfuerzo
    Given una mañana publicada con spots de confianza alta, media y baja para hoy y mañana, con un destino de nombre largo
    When el surfista abre la home publicada a 390 px, con tema "claro" y movimiento "normal"
    Then ninguna fila se desborda el ancho de 390 px ni recorta su texto al sumar la confianza
    And el puntaje y la palabra de confianza de cada fila se leen sin abrir nada
    And el toque de confianza mide al menos 44 por 44 px y no tiene movimiento
