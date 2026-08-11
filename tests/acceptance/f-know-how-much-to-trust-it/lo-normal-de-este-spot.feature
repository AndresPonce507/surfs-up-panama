@feature-f-know-how-much-to-trust-it
Feature: La razón deja de comparar los modelos contra nada y los compara contra lo normal de ese spot

  El desacuerdo absoluto entre modelos solo carga señal en las colas del
  historial propio de cada spot: eso dice la única investigación que este
  término tiene. Cuando un spot ya acumuló su propio historial de desacuerdos,
  "hoy se parten peor que lo normal acá" reemplaza a los umbrales absolutos.
  Un spot sin historial se queda con la forma de siempre, porque comparar un
  día contra un historial que no existe es exactamente la deshonestidad que
  este producto rechaza.

  # -------------------------------------------------------------------------
  # COMPUERTA DE DATOS REAL, registrada y no planeada por encima: el registro
  # empezó a acumular el 2026-08-08 y el umbral de activación aceptado es 30
  # días locales completos distintos por spot (Pre-requisito 7, cerrado).
  # Estos escenarios acumulan su propio historial por los puertos: sesenta
  # mañanas están por encima de 30 y dos por debajo. Si la política cambia por
  # un ADR posterior, se ajusta la constante del fixture, jamás el oráculo.
  # -------------------------------------------------------------------------

  @slice-05 @driving_port @in-memory @covers-R29
  Scenario: Un día partido peor que lo normal de ese spot se dice con sus palabras
    Given un spot que ya vivió más de sesenta mañanas en el registro con sus modelos casi siempre parecidos
    And hoy los modelos se parten peor que lo normal de ese spot
    When la mañana de hoy se arma y se publica leyendo el historial del spot
    Then la razón de hoy compara el día contra lo normal del propio spot
    And cada razón cabe en ciento sesenta caracteres y no filtra nada del código

  @slice-05 @driving_port @in-memory @negative @error @covers-R29
  Scenario: Un spot recién llegado al registro no se compara contra un historial que no tiene
    Given un spot con apenas dos mañanas en el registro
    And hoy los modelos se parten en el período
    When la mañana de hoy se arma y se publica leyendo el historial del spot
    Then cada razón nombra el desacuerdo de período
    And ninguna razón compara el día contra lo normal del spot

  @slice-05 @driving_port @in-memory @error
  Scenario: La razón nunca muestra un porcentaje ni suena a probabilidad
    Given un spot que ya vivió más de sesenta mañanas en el registro con sus modelos casi siempre parecidos
    And hoy los modelos se parten peor que lo normal de ese spot
    When la mañana de hoy se arma y se publica leyendo el historial del spot
    Then ninguna razón publicada muestra un porcentaje ni habla de probabilidad
    And ninguna razón publicada reclama ni sugiere una confirmación desde la playa

  @slice-05 @driving_port @in-memory @error @covers-R29
  Scenario: La ausencia de la marea manda aunque el historial exista
    Given un spot que ya vivió más de sesenta mañanas en el registro con sus modelos casi siempre parecidos
    And hoy falta el dato de la marea y los modelos se parecen
    When la mañana de hoy se arma y se publica leyendo el historial del spot
    Then cada razón nombra la marea que falta
    And ninguna razón compara el día contra lo normal del spot

  @slice-05 @driving_port @real-io @adapter-integration @error @covers-R29
  Scenario Outline: Un archivo histórico que no se puede confiar no publica una mañana a medias
    Given un historial durable de PublishedCall de la región pedida que está <falla>
    When la mañana de hoy se intenta armar por el comando de producción
    Then el comando se rehúsa antes de publicar con exactamente un evento "health.startup.refused"
    And el evento tiene el componente "published_call_history", scope.region_id de la región pedida, scope.prefix "log/calls/v1/" y razón "<razón>"
    And no se escribe ningún PublishedCall, bundle ni manifest

    Examples:
      | falla       | razón        |
      | inaccesible | unavailable  |
      | malformado  | malformed    |

  # -------------------------------------------------------------------------
  # La mitad de la lectura: sobre el sitio realmente construido, en Chromium a
  # 390 px. Depende del montaje entre lanes del paso 01-11: sin él ninguna
  # razón por fila llega a la página.
  # -------------------------------------------------------------------------

  @slice-05 @driving_port @real-io @adapter-integration @covers-R29
  Scenario: El surfista lee la comparación contra lo normal tal cual se publicó
    Given una mañana publicada donde una playa compara su día contra su propio normal
    When el surfista abre la lista del día de esa mañana y toca la confianza de cada fila
    Then la razón abierta de esa playa es exactamente la publicada y compara contra lo normal

  @slice-05 @driving_port @real-io @adapter-integration @ui-u1 @ui-u2 @ui-u3 @ui-u4 @ui-u5 @ui-u6 @ui-u7 @covers-R33 @covers-R34 @covers-R35 @covers-R36 @covers-R37 @covers-R38
  Scenario Outline: La razón que compara contra lo normal se lee limpia en el teléfono, tema <tema>, movimiento <movimiento>
    Given una mañana publicada donde una playa compara su día contra su propio normal
    When el surfista abre la lista del día de esa mañana a 390 px con tema "<tema>" y movimiento "<movimiento>"
    Then esa razón y su confianza cumplen las siete comprobaciones visuales sobre el fondo real

    Examples:
      | tema   | movimiento |
      | claro  | normal     |
      | oscuro | reducido   |
