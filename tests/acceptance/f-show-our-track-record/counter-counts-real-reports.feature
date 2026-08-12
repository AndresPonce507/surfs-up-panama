@feature-f-show-our-track-record
Feature: Desde el primer reporte de verdad, el contador de cada playa dice cuántos van

  Hoy este archivo entero está bloqueado por la realidad, no por pereza: cero
  reportes de surf se han mandado jamás, el camino de escritura no está
  desplegado, y ningún dato puede sembrarse ni fabricarse para desbloquearlo.
  Cada escenario lleva la etiqueta del bloqueo y se salta completo en cada
  corrida; el día que el camino de reportes esté desplegado y llegue el primer
  reporte real, la rebanada reentra a DISTILL, se quita la etiqueta, se
  registra su corrida en rojo y recién entonces se construye. Quitar la
  etiqueta antes de eso no enciende nada: los pasos fallan en voz alta
  nombrando lo que falta.

  Cuando corran, estas pruebas entran solo por donde entra un surfista: el
  sitio construido de verdad, servido por HTTP, leído a 390 px, con el
  contador saliendo del registro real de reportes. Ninguna prueba de esta
  rebanada puede satisfacerse con datos sembrados: un contador que diga tres
  porque alguien fabricó tres sería exactamente la mentira que este producto
  existe para no decir.

  @slice-03 @driving_port @real-io @blocked-on-real-reports @covers-R21 @negative
  Scenario: Repetir el mismo reporte jamás lo cuenta dos veces
    Given el camino de reportes está desplegado y una playa guarda tres reportes de verdad
    And el actualizador ya emparejó los tres una vez
    When el actualizador vuelve a correr sobre los mismos reportes
    Then las cuentas de esa playa quedan exactamente como estaban
    And ningún día ya contado cambia

  @slice-03 @driving_port @real-io @blocked-on-real-reports @covers-R22 @covers-R2
  Scenario: La primera playa con reportes de verdad ve moverse su contador
    Given el camino de reportes está desplegado y una playa guarda tres reportes de verdad
    When el surfista abre la página de esa playa a 390 px
    Then el recuadro dice, palabra por palabra, que van 3 reportes de los 30 que hacen falta
    And ese tres viene contado del registro real, nunca escrito a mano

  @slice-03 @driving_port @real-io @blocked-on-real-reports @covers-R3
  Scenario: Una playa sin reportes sigue en cero, ahora contado desde el registro real
    Given el camino de reportes está desplegado y una playa guarda tres reportes mientras otra no guarda ninguno
    When el surfista abre la página de la playa sin reportes a 390 px
    Then el recuadro dice que van 0 reportes de los 30 que hacen falta
    And ese cero viene de leer el registro real, no de suponer que no existe

  @slice-03 @driving_port @real-io @blocked-on-real-reports @negative @error @covers-R23
  Scenario: Si el historial no se puede leer, no se publica: la página anterior queda en pie
    Given el camino de reportes está desplegado y el historial de pronto no se puede leer
    When se intenta publicar el sitio
    Then la publicación falla en voz alta nombrando la fuente del historial
    And la página anterior sigue sirviendo, sin ningún cero fabricado encima de reportes reales

  @slice-03 @driving_port @real-io @blocked-on-real-reports @covers-R24
  Scenario: Las dos frases sobre los reportes de una playa nunca se contradicen
    Given el camino de reportes está desplegado y una playa acaba de recibir un reporte
    When se leen el contador de la página de esa playa y el mensaje de gracias del reporte
    Then los dos cuentan la misma historia sobre esa playa
    And ningún reporte aceptado puede hacer que una frase diga más que la otra

  @slice-03 @driving_port @real-io @blocked-on-real-reports @ui-u1 @ui-u2 @ui-u4 @ui-u5 @ui-u6 @ui-u7 @covers-R31 @covers-R32 @covers-R34 @covers-R35 @covers-R36 @covers-R37
  Scenario Outline: El recuadro contando se lee igual de bien en el teléfono, en los dos temas y sin movimiento
    Given el camino de reportes está desplegado y una playa guarda tres reportes de verdad
    When el surfista abre la página de esa playa a 390 px, en tema "<tema>" y con movimiento "<movimiento>"
    Then el recuadro contando cumple sus comprobaciones visuales sobre su propio fondo
    And la comprobación visual estática del sitio sigue pasando con el contador en marcha

    Examples:
      | tema   | movimiento |
      | claro  | normal     |
      | oscuro | reducido   |
