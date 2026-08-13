@feature-f-know-how-much-to-trust-it
Feature: Si el término del desacuerdo alguna vez miente, apagarlo es un cambio de datos

  El chequeo que puede probar que ese término miente vive en el carril del aprendizaje y
  ni siquiera puede correr todavía, porque nadie ha reportado desde la playa. Lo que se
  debe aquí es otra cosa y es anterior: la removibilidad. Que apagar el término sea editar
  una constante, que el nivel siga saliendo de los factores que quedan, y que la razón
  jamás nombre una cosa que ya no participa. Es el cinturón que tiene que existir antes de
  que a alguien le tiente dejar puesto un término mentiroso porque quitarlo sería obra.

  La historia arranca en la mañana de siempre, la que hoy se lee partida en el período, y
  desde ahí aprieta un caso más en cada escenario.

  @slice-03 @driving_port @in-memory
  Scenario: Con todos los términos prendidos, la mañana partida se lee igual que hoy
    Given un spot cuya mañana parte a los modelos en el período, con historial verificado
    And las constantes del proyecto llegan con todos los términos prendidos
    When se lee la confianza de ese spot como la arma su fila publicada
    Then la lectura nombra el período como la cosa en la que los modelos se parten
    And la lectura trae su palabra de confianza
    And la lectura conserva la frase de que nadie mandó todavía un reporte desde ese spot

  @slice-03 @driving_port @in-memory
  Scenario: Con el término del desacuerdo apagado, el nivel sale de los factores que quedan
    Given un spot cuya mañana parte a los modelos en el período, con historial verificado
    And las constantes del proyecto llegan con el término del desacuerdo apagado
    When se lee la confianza de ese spot como la arma su fila publicada
    Then la lectura no nombra ni el tamaño, ni el período, ni la dirección
    And el nivel sube a lo que el historial verificado gana por sí solo
    And la lectura trae su palabra de confianza
    And la lectura conserva la frase de que nadie mandó todavía un reporte desde ese spot
    And la lectura no muestra ninguna cifra ni ningún porcentaje

  @slice-03 @driving_port @in-memory @error
  Scenario: Con el término apagado y la marea a oscuras, la marea sigue frenando el nivel
    Given un spot cuya mañana parte a los modelos en el período, con historial verificado
    And las constantes del proyecto llegan con el término del desacuerdo apagado
    And ese mismo spot además se quedó sin dato de marea
    When se lee la confianza de ese spot como la arma su fila publicada
    Then la marea ausente le pone techo al nivel y la lectura se queda justo debajo de confianza alta
    And la lectura no nombra ni el tamaño, ni el período, ni la dirección
    And la lectura conserva la frase de que nadie mandó todavía un reporte desde ese spot

  @slice-03 @driving_port @in-memory @error
  Scenario: Con el término apagado y ningún otro factor informando, la lectura lo admite
    Given un spot cuya mañana deja a los modelos pareciéndose entre ellos, sin historial verificado y sin un solo reporte de playa
    And las constantes del proyecto llegan con el término del desacuerdo apagado
    When se lee la confianza de ese spot como la arma su fila publicada
    Then la lectura sale con confianza baja
    And la lectura admite que todavía no hay una señal usable para medir la confianza
    And la lectura nunca dice que los modelos coinciden
    And la lectura conserva la frase de que nadie mandó todavía un reporte desde ese spot

  @slice-03 @driving_port @real-io @adapter-integration
  Scenario: Apagar el término en las constantes y rearmar el sitio saca las tres cosas de todas las razones
    Given las constantes del proyecto llegan con el término del desacuerdo apagado
    When se rearma el sitio entero con esas constantes y se leen las razones que quedaron escritas
    Then ninguna razón del sitio rearmado nombra ni el tamaño, ni el período, ni la dirección
    And cada fila del sitio rearmado sigue trayendo su palabra de confianza
    And cada razón del sitio rearmado conserva la frase de que nadie mandó todavía un reporte
