@feature-f-tell-me-when-its-worth-the-drive
Feature: El aviso de la mañana, una vez y solo si vale la pena

  La corrida pasa cada hora y decide, sin ejecutar nada, a quién le toca aviso.
  Le toca a quien tiene ese spot en su mañana, cuando la mañana de ese spot
  llega a la barra que ese suscriptor tiene puesta. Ni antes de esa barra, ni
  fuera de la mañana, ni dos veces el mismo día.

  Sobre los números de abajo: la barra que aparece en cada ejemplo es la del
  suscriptor de ese ejemplo, puesta ahí por la prueba. NO es la barra por
  omisión del producto: nadie la ha decidido todavía, y ningún escenario de
  este archivo la afirma. Lo que se prueba es la ley, que es lo que sí está
  fijado: se avisa desde la barra hacia arriba, incluida la barra, y por debajo
  no se avisa. Cualquier valor que se ratifique después pasa estas pruebas sin
  tocarlas.

  La hora de la corrida entra como dato, nunca se lee del reloj del ambiente,
  que es lo que hace que la mañana se pueda probar sin esperar al amanecer.

  @slice-01 @driving_port @in-memory @covers-R15 @covers-R16 @covers-R19 @covers-R22
  Scenario Outline: Una mañana que llega a la barra del suscriptor produce exactamente un aviso
    Given un suscriptor de Playa Venao con su barra puesta en <barra>, que hoy no ha recibido nada
    And en Playa Venao son las siete de la mañana de su propio huso
    When la mañana de ese spot puntúa <puntaje>
    Then sale exactamente un aviso para ese suscriptor
    And ese aviso nombra el spot y su puntaje, en el idioma de ese suscriptor
    And ese aviso lleva a la página de ese spot, se agrupa por spot, y se vence a las cuatro horas

    Examples:
      | barra | puntaje |
      | 30    | 30      |
      | 55    | 55      |
      | 88    | 88      |
      | 55    | 91      |

  @slice-01 @driving_port @in-memory @negative @error @covers-R16
  Scenario Outline: Una mañana por debajo de la barra del suscriptor no produce ningún aviso
    Given un suscriptor de Playa Venao con su barra puesta en <barra>, que hoy no ha recibido nada
    And en Playa Venao son las siete de la mañana de su propio huso
    When la mañana de ese spot puntúa <puntaje>
    Then no sale ningún aviso

    Examples:
      | barra | puntaje |
      | 30    | 29      |
      | 55    | 54      |
      | 88    | 87      |

  @slice-01 @driving_port @in-memory @negative @error @covers-R17
  Scenario Outline: Fuera de la mañana no sale ningún aviso, por buena que esté
    Given un suscriptor de Playa Venao con su barra puesta en 55, que hoy no ha recibido nada
    And en Playa Venao es la hora "<hora>" de su propio huso
    When la mañana de ese spot puntúa 91
    Then no sale ningún aviso

    Examples:
      | hora  |
      | 05:25 |
      | 09:25 |
      | 13:25 |

  @slice-01 @driving_port @in-memory @negative @error @covers-R18
  Scenario: Nadie recibe dos avisos del mismo spot el mismo día
    Given un suscriptor de Playa Venao con su barra puesta en 55, que hoy no ha recibido nada
    And en Playa Venao son las siete de la mañana de su propio huso
    And la mañana de ese spot puntúa 91
    When ese suscriptor ya recibió su aviso de hoy y la corrida vuelve a pasar una hora después
    Then no sale ningún aviso

  @slice-01 @driving_port @in-memory @covers-R23
  Scenario: Un suscriptor que no eligió barra igual se rige por una barra, la del servidor
    Given un suscriptor de Playa Venao que no eligió ninguna barra, que hoy no ha recibido nada
    And en Playa Venao son las siete de la mañana de su propio huso
    When se recorre toda la escala de puntajes posibles de esa mañana
    Then hay un solo punto de corte: por debajo nunca sale aviso, y de ahí hacia arriba siempre sale
    And ese punto de corte cae dentro de la escala de puntajes

  @slice-01 @driving_port @in-memory @negative @error @covers-R15
  Scenario: Un spot en otro huso usa su propia mañana, no la de Panamá
    Given un spot cuyo huso va seis horas por delante de Panamá, con un suscriptor cuya barra está en 55
    And en Panamá son las siete de la mañana, y en ese spot ya pasó del mediodía
    When la mañana de ese spot puntúa 91
    Then no sale ningún aviso

  @slice-01 @driving_port @in-memory @covers-R20
  Scenario: Pasado el tope de envíos de una corrida, lo que queda se anuncia en voz alta
    Given más suscriptores en su mañana buena de los que caben en una corrida
    When la corrida arma sus avisos
    Then arma como mucho el tope de esa corrida
    And queda anunciado en voz alta cuántos quedaron para después

  @slice-01 @driving_port @in-memory @negative @error @covers-R21
  Scenario Outline: Un destino que ya no existe se borra al primer fallo
    Given un aviso armado para un suscriptor de Playa Venao
    When el servicio de avisos contesta "<respuesta>" a ese envío
    Then esa suscripción queda marcada para borrarse

    Examples:
      | respuesta      |
      | no encontrado  |
      | ya no existe   |
      | prohibido      |

  @slice-01 @driving_port @in-memory @negative @error @covers-R21
  Scenario: Un fallo pasajero del servicio de avisos no borra a nadie
    Given un aviso armado para un suscriptor de Playa Venao
    When el servicio de avisos contesta "ahora no puedo" a ese envío
    Then ninguna suscripción queda marcada para borrarse
