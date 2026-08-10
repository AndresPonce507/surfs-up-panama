@feature-f-show-our-track-record
Feature: La mañana que una playa se lo gana, el mismo recuadro deja de contar y empieza a afirmar

  Este archivo entero está bloqueado dos veces, y las dos en serio. Primero por
  los datos: ninguna playa puede pasar la reja durante meses, porque hacen
  falta al menos diez pares verificados de al menos cinco personas de
  confianza con una diferencia mayor que dos veces su margen con piso, y hoy
  hay cero reportes en todo el sitio. Segundo por la palabra: la frase en
  español de la afirmación NO está asentada en ninguna parte; la oración de
  ejemplo del documento de diseño es un ejemplo trabajado, no copy aprobado, y
  asentarla es de Andres con su gente, nunca de una prueba. Cada escenario
  lleva la etiqueta del bloqueo y se salta completo; quitarla antes de tiempo
  no enciende nada, los pasos fallan nombrando el prerrequisito abierto.

  En DISTILL, cuando la copy esté asentada y la regla de selección de llave
  esté fijada, el camino de dibujo puede probarse con bloques de prueba
  inyectados por la costura del productor, porque probar que el recuadro sabe
  dibujar una afirmación no es lo mismo que fingir que una playa se la ganó:
  ningún dato de prueba toca jamás la superficie pública ni el registro real.
  El examen con datos reales queda diferido, registrado como diferido, hasta
  la primera mañana que una playa pase la reja de verdad.

  @slice-04 @driving_port @blocked-on-real-reports @covers-R25
  Scenario: El más-menos impreso es el margen con piso, nunca el error crudo
    Given una playa gateada cuyo error de muestra quedó por debajo del piso físico
    When se compone la afirmación de esa playa
    Then el más-menos impreso es el margen con piso
    And ninguna superficie puede imprimir una precisión que el ruido físico desmiente

  @slice-04 @driving_port @blocked-on-real-reports @negative @covers-R25
  Scenario: La frase de la afirmación es la asentada palabra por palabra, sin raya larga y sin texto técnico
    Given la frase de la afirmación quedó asentada por Andres y su gente
    When se compone la afirmación con los números de una playa gateada
    Then la frase es la asentada exacta con sus números en su sitio
    And no trae raya larga, ni inglés, ni texto técnico, ni marcador de relleno

  @slice-04 @driving_port @blocked-on-real-reports @covers-R26
  Scenario: Cuando varias llaves pasan la reja, la playa muestra la que manda la regla asentada
    Given una playa donde más de una combinación de fuente y horizonte pasó la reja
    When se decide qué afirmación muestra la página de esa playa
    Then la elegida es la que manda la regla asentada por el carril del dominio
    And ninguna prueba inventa esa regla por su cuenta

  @slice-04 @driving_port @real-io @blocked-on-real-reports @covers-R25
  Scenario: La afirmación ganada toma el lugar del contador en el mismo recuadro
    Given una playa que de verdad pasó la reja con 22 pares de 7 personas
    When el surfista abre la página de esa playa a 390 px
    Then el recuadro trae la afirmación en lugar del contador, nunca los dos
    And la afirmación llega compuesta de fábrica y el teléfono no calcula nada

  @slice-04 @driving_port @real-io @blocked-on-real-reports @negative @covers-R25
  Scenario: Debajo de la reja el recuadro sigue contando: jamás las dos cosas, jamás ninguna
    Given una playa gateada y otra que sigue debajo de la reja
    When se revisan las páginas de las dos playas
    Then la playa debajo de la reja muestra solo su contador honesto
    And cada página muestra exactamente uno de los dos estados, nunca ambos, nunca ninguno

  @slice-04 @driving_port @real-io @blocked-on-real-reports @negative @covers-R25
  Scenario: Ningún número por debajo de la reja se asoma en ninguna página del sitio
    Given el sitio construido con playas gateadas y playas debajo de la reja
    When se revisan todas las páginas de spot que el sitio emitió con sus recuadros
    Then ninguna página cuya playa siga debajo de la reja insinúa porcentaje, margen ni metros de error
    And la revisión dice cuántas páginas miró, y cero miradas es una falla

  @slice-04 @driving_port @real-io @blocked-on-real-reports @ui-u1 @ui-u2 @ui-u4 @ui-u5 @ui-u6 @ui-u7 @covers-R31 @covers-R32 @covers-R34 @covers-R35 @covers-R36 @covers-R37
  Scenario Outline: La afirmación se lee tan bien como el contador, en los dos temas y sin movimiento
    Given una playa que de verdad pasó la reja con 22 pares de 7 personas
    When el surfista abre la página de esa playa a 390 px, en tema "<tema>" y con el movimiento "<movimiento>"
    Then la afirmación cumple sus comprobaciones visuales sobre su propio fondo
    And la afirmación se ve como una nota medida, nunca como un anuncio

    Examples:
      | tema   | movimiento |
      | claro  | normal     |
      | oscuro | reducido   |
