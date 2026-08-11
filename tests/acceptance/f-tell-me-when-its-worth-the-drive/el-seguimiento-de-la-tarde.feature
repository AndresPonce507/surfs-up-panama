@feature-f-tell-me-when-its-worth-the-drive
Feature: La pregunta de la tarde después de un aviso

  Un aviso de la mañana no basta para aprender si valió la pena ir. Después de
  un aviso que sí salió, la tarde pregunta cómo estuvo aunque el mar haya
  cambiado para peor. Así, quien recibió el aviso puede contar lo que vio sin
  que solo queden las mañanas buenas.

  @slice-03 @driving_port @in-memory @covers-R41
  Scenario: Después de un aviso de la mañana, la tarde pregunta cómo estuvo
    Given una surfista de Playa Venao recibió su aviso esta mañana y todavía no contó cómo estuvo hoy
    And en Playa Venao son las tres y veinticinco de la tarde
    When pasa la corrida de la tarde
    Then sale una sola pregunta de cómo estuvo para esa surfista
    And la pregunta lleva a contar cómo estuvo Playa Venao

  @slice-03 @driving_port @in-memory @covers-R41
  Scenario: La pregunta llega aunque la mañana se haya puesto mala después del aviso
    Given una surfista de Playa Venao recibió su aviso esta mañana y todavía no contó cómo estuvo hoy
    And ahora Playa Venao está mala para surfear
    And en Playa Venao son las tres y veinticinco de la tarde
    When pasa la corrida de la tarde
    Then sale una sola pregunta de cómo estuvo para esa surfista

  @slice-03 @driving_port @in-memory @negative @error @covers-R41
  Scenario: La tarde no vuelve a preguntar a quien ya contó cómo estuvo hoy
    Given una surfista de Playa Venao recibió su aviso esta mañana y ya contó cómo estuvo hoy
    And en Playa Venao son las tres y veinticinco de la tarde
    When pasa la corrida de la tarde
    Then no sale ninguna pregunta de cómo estuvo

  @slice-03 @driving_port @in-memory @negative @error @covers-R41
  Scenario Outline: Fuera de la tarde no sale la pregunta aunque hubo aviso
    Given una surfista de Playa Venao recibió su aviso esta mañana y todavía no contó cómo estuvo hoy
    And la tarde de Playa Venao marca "<hora>" en su propio huso
    When pasa la corrida de la tarde
    Then no sale ninguna pregunta de cómo estuvo

    Examples:
      | hora  |
      | 13:25 |
      | 17:25 |

  @slice-03 @driving_port @in-memory @negative @error @covers-R41
  Scenario: Sin aviso de la mañana no hay pregunta de la tarde
    Given una surfista de Playa Venao no recibió ningún aviso esta mañana
    And en Playa Venao son las tres y veinticinco de la tarde
    When pasa la corrida de la tarde
    Then no sale ninguna pregunta de cómo estuvo

  @slice-03 @walking_skeleton @driving_port @real-io @requires_external @deploy-blocked @ui-u1 @ui-u2 @ui-u3 @ui-u4 @ui-u5 @ui-u6 @ui-u7 @covers-R41
  Scenario: Quien recibió el aviso de la mañana recibe la pregunta de la tarde
    Given un teléfono real recibió el aviso de la mañana de Playa Venao
    And en Playa Venao son las tres y veinticinco de la tarde
    When pasa la corrida de la tarde en el sitio publicado
    Then ese teléfono recibe una sola pregunta de cómo estuvo Playa Venao
    And la pregunta abre el camino de contar cómo estuvo Playa Venao

  @slice-03 @driving_port @real-io @requires_external @deploy-blocked @covers-R42
  Scenario: La surfista cuenta cómo estuvo desde la pregunta y queda marcado que se le preguntó
    Given una surfista recibió la pregunta de cómo estuvo de Playa Venao
    When cuenta que las olas estaban de dos a tres pies y que el viento estaba limpio
    Then su observación queda guardada como una respuesta a la pregunta
