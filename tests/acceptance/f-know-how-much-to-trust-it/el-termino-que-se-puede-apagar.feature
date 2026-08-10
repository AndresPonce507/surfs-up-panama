@feature-f-know-how-much-to-trust-it
Feature: Si el término del desacuerdo alguna vez miente, apagarlo es un cambio de datos

  El chequeo de calibración vive en otro carril y ni siquiera puede correr
  hasta que existan reportes. Lo que se debe aquí es la removibilidad: que
  apagar el término del desacuerdo sea un cambio de datos, que el nivel siga
  saliendo de los factores que quedan, y que la razón jamás nombre un término
  que ya no participa. Es el cinturón que tiene que existir antes de que a
  alguien le tiente publicar un término mentiroso porque quitarlo sería obra.

  @slice-03 @driving_port @in-memory @covers-R22 @covers-R23 @covers-R24
  Scenario: Apagar el término del desacuerdo es un cambio de datos y el nivel sigue saliendo de lo que queda
    Given una mañana con el dato de la marea completo y los modelos partidos en el período
    And la política de datos llega con el término del desacuerdo apagado
    When esa mañana se arma y se publica con esa política de datos
    Then cada playa publicada sigue trayendo su palabra de confianza
    And ninguna razón nombra el término apagado

  @slice-03 @driving_port @in-memory @error @covers-R25
  Scenario: Sin ningún factor que informe, el nivel dice bajo y la razón admite que no hay señal todavía
    Given una mañana con el dato de la marea completo y los modelos pareciéndose entre ellos
    And la política de datos llega con el término del desacuerdo apagado
    When esa mañana se arma y se publica con esa política de datos
    Then cada playa se publica con confianza baja
    And cada razón dice que todavía no hay una señal usable para medir la confianza
    And ninguna razón publicada reclama ni sugiere una confirmación desde la playa

  @slice-03 @driving_port @in-memory @error @covers-R24
  Scenario: Con el término apagado y la marea ausente, la razón sigue nombrando la marea y nada más
    Given una mañana sin dato de marea, con los modelos pareciéndose entre ellos
    And la política de datos llega con el término del desacuerdo apagado
    When esa mañana se arma y se publica con esa política de datos
    Then cada razón nombra la marea que falta
    And ninguna razón nombra el término apagado

  @slice-03 @driving_port @in-memory @covers-R22
  Scenario: Con todos los factores prendidos la mañana de siempre publica lo de siempre
    Given una mañana sin dato de marea, con los modelos pareciéndose entre ellos
    And la política de datos llega con todos los factores prendidos
    When esa mañana se arma y se publica con esa política de datos
    Then cada razón nombra la marea que falta
    And ninguna playa se publica con confianza alta
