@feature-f-know-how-much-to-trust-it
Feature: La historia de la confianza sobrevive a su único vendor

  Hoy los cuatro miembros llegan por una sola llamada a un solo vendor. Si ese
  vendor amanece caído, la premisa entera se cae con él. La fuente
  independiente es dominio público de NOAA, entra por el mismo puerto como un
  registro más, deja sus filas en el registro desde su primera hora, y una
  fuente oscura encoge el conteo honestamente: nunca una fila en blanco, nunca
  un miembro inventado, nunca un registro reescrito.

  @slice-04 @driving_port @in-memory @covers-R26 @covers-R27
  Scenario: La fuente independiente queda archivada tal cual desde su primera mañana
    Given una mañana en que el vendor de siempre y la fuente independiente respondieron los dos
    When esa mañana se arma y se publica con las dos fuentes declaradas
    Then el archivo en bruto de esa mañana guarda la respuesta de cada fuente tal cual llegó
    And el registro de predicciones trae las filas de esa mañana una sola vez, sin duplicar un modelo que llegó por dos caminos

  @slice-04 @driving_port @in-memory @covers-R27
  Scenario: Repetir la mañana no reescribe la historia de ninguna fuente
    Given una mañana en que el vendor de siempre y la fuente independiente respondieron los dos
    And esa mañana ya se armó y se publicó con las dos fuentes declaradas
    When esa misma mañana se vuelve a armar
    Then el registro de predicciones queda exactamente como la primera vez

  @slice-04 @driving_port @in-memory @negative @error @covers-R28
  Scenario: El vendor de siempre amanece caído y la mañana se publica igual con lo que sí llegó
    Given una mañana en que el vendor de siempre no respondió y la fuente independiente sí
    When esa mañana se arma y se publica con las dos fuentes declaradas
    Then la mañana igual se publica con los miembros que sí llegaron
    And el conteo de modelos de esa mañana es el de los que de verdad respondieron

  @slice-04 @driving_port @in-memory @error @covers-R28
  Scenario: La fuente independiente amanece caída y nadie inventa un miembro
    Given una mañana en que la fuente independiente no respondió y el vendor de siempre sí
    When esa mañana se arma y se publica con las dos fuentes declaradas
    Then la mañana igual se publica con los miembros que sí llegaron
    And el archivo en bruto de esa mañana no guarda nada de la fuente que calló

  @slice-04 @driving_port @in-memory @error @covers-R28
  Scenario: El día en que entre todas las fuentes respondió un solo modelo se dice así
    Given una mañana en que entre todas las fuentes respondió un solo modelo
    When esa mañana se arma y se publica con las dos fuentes declaradas
    Then ninguna playa pasa de confianza baja
    And cada razón dice que respondió un solo modelo
    And ninguna razón culpa a los modelos de un desacuerdo que no hubo

  # -------------------------------------------------------------------------
  # La integración del adaptador con datos reales: una respuesta del
  # grib_filter de NOAA capturada tal cual (la captura es tarea de DELIVER,
  # paso 04-05) traducida por el adaptador real. Datos sintéticos esconden
  # los desajustes de formato que ya mordieron una vez a este repositorio.
  # -------------------------------------------------------------------------

  @slice-04 @driving_port @real-io @adapter-integration @covers-R26
  Scenario: La respuesta real de la fuente independiente se entiende tal cual llega
    Given una respuesta real de la fuente independiente capturada tal cual llegó
    When esa respuesta se traduce al idioma de los miembros
    Then salen miembros con su corrida atribuida y sus horas en el idioma de la casa
