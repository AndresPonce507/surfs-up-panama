@feature-f-tell-me-when-its-worth-the-drive
Feature: La pregunta de la tarde, también los días malos

  La tarde después de un aviso de la mañana, se pregunta cómo estuvo. Siempre
  que hubo aviso, y solo cuando hubo aviso. También, y sobre todo, cuando la
  mañana salió mala: nadie cuenta por su cuenta una mañana reventada, así que
  si solo llegan relatos de los días buenos, el que aprende de ellos se
  equivoca con confianza justo donde más importa, en decir que no vale la pena
  manejar. Preguntar en los días con aviso, salga como salga el mar, es lo que
  convierte esos relatos en una muestra casi al azar de los días avisados. Por
  eso la respuesta pedida va marcada como pedida: el que aprende la pesa
  distinto, porque quien responde ya vio el puntaje de la mañana en el aviso.

  La hora de la corrida entra como dato, nunca se lee del reloj del ambiente,
  igual que en la mañana. Los días que nunca reciben aviso quedan sin
  preguntar; ese punto ciego es del carril que aprende, no de este archivo.

  @slice-03 @driving_port @in-memory @covers-R41
  Scenario: La tarde después del aviso llega una sola pregunta de cómo estuvo
    Given un suscriptor de Playa Venao que recibió su aviso esta mañana
    And en Playa Venao son las tres de la tarde de su propio huso
    When la corrida de la tarde arma sus preguntas
    Then sale exactamente una pregunta de cómo estuvo para ese suscriptor
    And esa pregunta lleva directo a contar cómo estuvo ese spot, y va marcada como pregunta nuestra

  @slice-03 @driving_port @in-memory @covers-R46
  Scenario: La pregunta llega también cuando la mañana salió mala
    Given un suscriptor de Playa Venao que recibió su aviso esta mañana
    And en Playa Venao son las tres de la tarde de su propio huso
    And a esa hora el mar ya está malo y el puntaje del spot se vino abajo
    When la corrida de la tarde arma sus preguntas
    Then sale exactamente una pregunta de cómo estuvo para ese suscriptor

  @slice-03 @driving_port @in-memory @negative @error @covers-R41
  Scenario: Sin aviso por la mañana no hay pregunta por la tarde
    Given un suscriptor de Playa Venao que hoy no recibió ningún aviso
    And en Playa Venao son las tres de la tarde de su propio huso
    When la corrida de la tarde arma sus preguntas
    Then no sale ninguna pregunta

  @slice-03 @driving_port @in-memory @negative @error @covers-R47
  Scenario Outline: Fuera de la tarde no sale ninguna pregunta
    Given un suscriptor de Playa Venao que recibió su aviso esta mañana
    And en Playa Venao es la hora "<hora>" de su propio huso
    When la corrida de la tarde arma sus preguntas
    Then no sale ninguna pregunta

    Examples:
      | hora  |
      | 13:25 |
      | 17:25 |

  @slice-03 @driving_port @in-memory @negative @error @covers-R47
  Scenario: Nadie recibe dos preguntas el mismo día
    Given un suscriptor de Playa Venao que recibió su aviso esta mañana
    And en Playa Venao son las tres de la tarde de su propio huso
    When ese suscriptor ya recibió su pregunta de hoy y la corrida vuelve a pasar una hora después
    Then no sale ninguna pregunta

  @slice-03 @driving_port @real-io @deploy-blocked @covers-R42 @covers-R48
  Scenario: Los tres toques fríos que responden a la pregunta quedan guardados como respuesta pedida
    Given un teléfono que recibió la pregunta de la tarde
    When el surfista toca la pregunta y manda sus tres toques fríos
    Then la pantalla donde cae no le mostró ni puntaje ni pronóstico antes de mandar
    And su relato queda guardado marcado como respuesta a nuestra pregunta
    And queda en el mismo registro de observaciones que cualquier otro relato

  @slice-03 @driving_port @real-io @ui-u1 @ui-u2 @ui-u3 @ui-u4 @ui-u5 @ui-u6 @ui-u7 @covers-R49
  Scenario Outline: La pantalla donde cae la pregunta se ve terminada, en los dos temas
    Given la pantalla de contar cómo estuvo, abierta desde la pregunta de la tarde a 390 px con tema "<tema>" y movimiento "<movimiento>"
    Then esa pantalla cumple las siete comprobaciones visuales

    Examples:
      | tema   | movimiento |
      | claro  | normal     |
      | oscuro | reducido   |
