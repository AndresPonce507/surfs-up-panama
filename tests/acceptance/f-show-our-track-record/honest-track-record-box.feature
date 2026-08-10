@feature-f-show-our-track-record
Feature: Debajo del pronóstico, cada spot dice honestamente que todavía no sabemos si le acertamos

  Nadie ha mandado nunca un reporte desde la playa. Cero. Así que en la página de
  cualquier spot, justo debajo del pronóstico, el sitio no puede presumir de nada:
  dice con todas sus letras que todavía no puede decirte si le acertamos ahí, y
  enseña cuántos reportes lleva de los que hacen falta. Ese recuadro es el
  producto honesto del día uno, y es de verdad: se ve, se lee en el teléfono y no
  trae ni una sola cifra de acierto inventada.

  Estas pruebas entran solo por donde entra un surfista: se construye el sitio de
  verdad desde este repositorio, se sirve lo que quedó en dist/ por HTTP, y se
  lee con un navegador a 390 px. Ninguna prueba de esta rebanada toca un campo de
  la carga publicada: hoy el productor no manda el bloque a ninguna parte, y una
  prueba contra un campo sin productor sería inventar el diseño en vez de
  probarlo.

  @slice-01 @walking_skeleton @driving_port @real-io @adapter-integration @covers-R1 @covers-R8
  Scenario: El surfista abre su playa y lee, debajo del pronóstico, que todavía no podemos decirle si acertamos ahí
    Given una superficie construida desde el repositorio real, sin nube ni red
    When el surfista abre la página de un spot a 390 px
    Then debajo del pronóstico aparece el recuadro del historial con la frase asentada palabra por palabra
    And el recuadro va después del pronóstico de mañana y antes del llamado a reportar

  @slice-01 @driving_port @real-io @adapter-integration @sweep @covers-R1 @covers-R2
  Scenario: Ninguna playa se queda sin su recuadro, ni la última de la lista
    Given una superficie construida desde el repositorio real, sin nube ni red
    When se revisan todas las páginas de spot que el sitio emitió
    Then la revisión dice cuántas páginas miró, y cero páginas miradas es una falla
    And todas las páginas revisadas traen la frase asentada con sus dos números, cero y treinta

  @slice-01 @driving_port @real-io @covers-R4
  Scenario: La frase y sus números llegan en lo que se sirve, sin que el teléfono calcule nada
    Given una superficie construida desde el repositorio real, sin nube ni red
    When el teléfono pide la página de un spot y no ejecuta nada
    Then lo que llega ya trae la frase asentada con sus dos números

  @slice-01 @driving_port @real-io @negative @error @covers-R2 @covers-R7
  Scenario: El recuadro no insinúa ninguna cifra de acierto ni ningún margen
    Given una superficie construida desde el repositorio real, sin nube ni red
    When el surfista abre la página de un spot a 390 px
    Then dentro del recuadro los únicos números son el cero y el treinta de la frase
    And dentro del recuadro no hay porcentaje, ni margen con más y menos, ni metros de error

  @slice-01 @driving_port @real-io @negative @error @covers-R7
  Scenario: La frase del recuadro es la asentada, sin raya larga, sin inglés y sin marcadores de relleno
    Given una superficie construida desde el repositorio real, sin nube ni red
    When el surfista abre la página de un spot a 390 px
    Then el recuadro trae la frase asentada exacta, sin raya larga ni marcadores de relleno
    And dentro del recuadro no hay texto en inglés ni texto técnico

  @slice-01 @driving_port @real-io @ui-u1 @ui-u2 @ui-u4 @ui-u5 @ui-u6 @ui-u7 @covers-R31 @covers-R32 @covers-R34 @covers-R35 @covers-R36 @covers-R37
  Scenario Outline: El recuadro se lee bien en el teléfono, en los dos temas y sin movimiento
    Given una superficie construida desde el repositorio real, sin nube ni red
    When el surfista abre la página de un spot a 390 px, con tema "<tema>" y movimiento "<movimiento>"
    Then el recuadro cumple sus comprobaciones visuales sobre su propio fondo
    And la comprobación visual estática del sitio sigue pasando con el recuadro puesto

    Examples:
      | tema   | movimiento |
      | claro  | normal     |
      | oscuro | reducido   |

  @slice-01 @driving_port @real-io @covers-R4 @covers-R9
  Scenario: El recuadro no le mete ni una isla ni un guion al teléfono
    Given una superficie construida desde el repositorio real, sin nube ni red
    When se revisa el documento que el sitio emitió para un spot
    Then el documento ya trae la frase asentada escrita
    And el documento no trae ningún guion que la arme en el teléfono
