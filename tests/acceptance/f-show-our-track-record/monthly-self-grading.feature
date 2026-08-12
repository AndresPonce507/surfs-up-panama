@feature-f-show-our-track-record
Feature: Una vez al mes el producto se califica a sí mismo por escrito, donde Andres puede leerlo

  Este archivo está bloqueado por tres ausencias reales: no existe ni un
  reporte de surf, la exportación nocturna de observaciones no tiene dueño en
  ningún plan, y las filas del registro publicado todavía no llevan el orden
  del modelo crudo que la comparación necesita. Un archivo de métricas hecho
  de ceros no es un veredicto que Andres pueda usar, así que cada escenario
  lleva la etiqueta del bloqueo y se salta completo hasta que la rebanada
  reentre a DISTILL con datos reales detrás. Quitar la etiqueta antes de
  tiempo no enciende nada: los pasos fallan nombrando la ausencia exacta.

  El entregable no es una página: es el archivo mensual de métricas y el
  veredicto del interruptor que puede eliminar un término de confianza el día
  que los datos muestren que la confianza alta no acierta más. Una página
  pública de exactitud queda explícitamente fuera de alcance. La evaluación
  lee solo los registros inmutables; jamás toca el almacén de escritura, y
  jamás presume en ninguna superficie pública lo que el archivo apenas cuenta.

  @slice-05 @driving_port @in-memory @blocked-on-real-reports @covers-R27
  Scenario: Cada par compara dentro de la misma persona y los empates chicos no cuentan
    Given reportes reales donde una misma persona calificó dos playas el mismo día
    When la calificación mensual arma los pares de comparación
    Then cada par pregunta si nuestro orden coincidió con el de esa persona
    And los empates de menos de un paso de calidad quedan fuera
    And cada par se compara también contra el orden del modelo crudo

  @slice-05 @driving_port @blocked-on-real-reports @covers-R27
  Scenario: El archivo mensual trae las seis filas asentadas, comparadas contra sus líneas base
    Given un mes con reportes reales en los registros
    When corre la calificación mensual
    Then el archivo del mes trae las seis filas asentadas, cada una con su línea base
    And el avance hacia los 400 pares aparece contado, nunca presumido

  @slice-05 @driving_port @blocked-on-real-reports @negative @covers-R29
  Scenario: Si los días de confianza alta no aciertan más, el término señalado se elimina, no se reajusta
    Given un mes cuya calibración muestra que la confianza alta no acierta más que la baja
    When corre la calificación mensual
    Then el archivo registra un veredicto de remoción del término de confianza señalado
    And el veredicto es eliminar, nunca reponderar, y el primer candidato es el término de dispersión

  @slice-05 @driving_port @real-io @blocked-on-real-reports @negative @covers-R28
  Scenario: El avance hacia los 400 pares se cuenta en el archivo y no se presume en ninguna página
    Given un archivo mensual con avance real hacia los 400 pares
    When se revisan todas las páginas y textos que el sitio emite
    Then ninguna superficie pública afirma que somos mejores que el modelo crudo
    And el único lugar donde el avance existe es el archivo que lee Andres

  @slice-05 @driving_port @blocked-on-real-reports @covers-R30
  Scenario: La evaluación lee solo los registros inmutables, nunca el almacén de escritura
    Given la calificación mensual configurada sin ningún acceso al almacén de escritura
    When corre la calificación mensual
    Then la corrida termina completa leyendo solo los tres registros y la resolución de identidad
    And ningún paso intenta tocar el almacén de escritura

  @slice-05 @driving_port @blocked-on-real-reports @negative @covers-R27
  Scenario: Un mes sin pares dice que no alcanza, jamás inventa un veredicto
    Given un mes cuyos registros no tienen ni un par comparable
    When corre la calificación mensual
    Then el archivo dice cuántos pares hay, cero, y que no alcanza para calificar
    And ningún veredicto ni cifra de acierto aparece en el archivo
