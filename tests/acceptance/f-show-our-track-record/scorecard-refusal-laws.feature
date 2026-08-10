@feature-f-show-our-track-record
Feature: La aritmética del historial existe como leyes que se niegan a publicar lo que los datos no respaldan

  El corazón del historial son cuentas: emparejar cada reporte con lo que el
  sitio de verdad pronosticó para esa hora y esa playa, sumar los días, derivar
  las ventanas, y decidir si el recuadro cuenta o afirma. La reja tiene tres
  candados y los tres viven en código: al menos diez observaciones emparejadas,
  al menos cinco personas distintas dignas de confianza, y una diferencia más
  grande que dos veces su margen con piso. Estas pruebas son las leyes de esa
  aritmética, exploradas con datos de prueba generados, y la mayoría son leyes
  de rechazo: lo que importa demostrar es que nada por debajo de la reja se
  publica jamás, ni siquiera cuando mentirosos coordinados se ponen de acuerdo.

  Estas pruebas entran por una sola puerta: la proyección del historial, la
  función que recibe los dos registros inmutables y devuelve las cuentas y el
  bloque de cada playa. Cero nube, cero red, cero página: esta rebanada no
  dibuja nada, y por eso cada frase que publica es verdad. Los datos de prueba
  ejercitan la aritmética y solo la aritmética; jamás se disfrazan de reportes
  reales en ninguna superficie pública.

  @slice-02 @driving_port @in-memory @property @covers-R14
  Scenario: Cada reporte se empareja solo con la hora y la playa que el sitio de verdad pronosticó
    Given un registro de pronósticos y reportes de prueba con horas y playas variadas
    When la proyección del historial empareja los reportes contra el registro
    Then cada residuo proviene de un pronóstico de la misma playa y la misma hora redondeada
    And el signo de cada residuo es pronóstico menos observado
    And las filas de pronóstico marcadas como tierra no forman ningún par

  @slice-02 @pending @driving_port @in-memory @negative @error @covers-R17
  Scenario: El viento no entra al historial por ninguna puerta
    Given datos de prueba que intentan colar una variable de viento en el historial
    When la proyección del historial procesa esos datos
    Then la variable de viento se rechaza en voz alta, nombrándola
    And ningún residuo de viento aparece en ninguna cuenta

  @slice-02 @driving_port @in-memory @property @covers-R15
  Scenario: El orden en que lleguen los reportes jamás cambia la cuenta
    Given cualquier conjunto de reportes de prueba emparejables
    When la proyección procesa el conjunto en dos órdenes distintos
    Then las cuentas diarias y las ventanas quedan idénticas en ambos órdenes

  @slice-02 @pending @driving_port @in-memory @property @covers-R15
  Scenario: Sumar un reporte nuevo no reescribe ningún día ya contado
    Given una cuenta construida con reportes de prueba de varios días
    When la proyección suma un reporte nuevo
    Then el día del reporte nuevo es el único cuya cuenta cambia

  @slice-02 @pending @driving_port @in-memory @property @covers-R16
  Scenario: Las ventanas de 30 y 90 días derivan el sesgo y el error con las fórmulas asentadas
    Given una cuenta con reportes de prueba repartidos en más de noventa días
    When la proyección deriva las ventanas de 30 y 90 días
    Then el sesgo de cada ventana es el promedio de sus errores, con su error absoluto medio al lado
    And las personas distintas se resuelven a través de la identidad al momento de leer

  @slice-02 @driving_port @in-memory @property @negative @covers-R12
  Scenario: Reportes coordinados que están demasiado de acuerdo nunca aflojan la reja
    Given dos conjuntos de prueba del mismo tamaño y el mismo sesgo, uno coordinado sin variación y uno honesto
    When la proyección deriva el margen de cada uno
    Then el margen guardado nunca baja del piso físico del ruido
    And el conjunto coordinado jamás publica antes que el honesto

  @slice-02 @pending @driving_port @in-memory @negative @error @covers-R13
  Scenario: El filtro de confianza se ve disparar: una credencial joven pierde sus muestras
    Given reportes de prueba donde una credencial nació ayer y las demás son veteranas
    And una configuración de confianza de prueba que exige credenciales con edad
    When la proyección cuenta a las personas que respaldan cada llave
    Then las muestras de la credencial joven quedan fuera de toda cuenta con reja
    And con la configuración en ceros la cuenta es idéntica a no filtrar

  @slice-02 @pending @driving_port @in-memory @property @negative @covers-R10
  Scenario: Con menos de cinco personas de verdad nunca se publica una cifra
    Given cualquier conjunto de reportes de prueba con menos de cinco personas elegibles
    When la proyección decide qué dice el recuadro
    Then la decisión es siempre el estado del contador, jamás una afirmación
    And da igual cuán grande sea el sesgo o cuántas observaciones haya

  @slice-02 @pending @driving_port @in-memory @property @negative @covers-R11
  Scenario: Con menos de diez observaciones emparejadas nunca se publica una cifra
    Given cualquier conjunto de reportes de prueba con menos de diez pares
    When la proyección decide qué dice el recuadro
    Then la decisión es siempre el estado del contador, jamás una afirmación

  @slice-02 @pending @driving_port @in-memory @property @covers-R5 @covers-R6
  Scenario: El contador sale de los dos enteros del bloque y con su forma exacta
    Given cualquier estado de la cuenta de una playa
    When la proyección arma el bloque del historial
    Then el contador del bloque son sus propios dos enteros unidos con la barra
    And el umbral treinta viene de su única casa exportada

  @slice-02 @pending @driving_port @in-memory @covers-R18
  Scenario: Los anclajes de calidad tienen una sola casa y el puntaje los cita tal cual
    Given un reporte de prueba con cada etiqueta de calidad
    When la proyección forma el residuo de puntaje de cada uno
    Then cada residuo usa el ancla asentada de su etiqueta desde la única casa de constantes
    And el piso de ruido del puntaje es un paso de ancla, veinticinco puntos

  @slice-02 @pending @driving_port @in-memory @property @covers-R20
  Scenario: Todo el historial se reconstruye idéntico desde los dos registros inmutables
    Given cualquier conjunto de reportes de prueba acumulado reporte por reporte
    When la proyección recalcula todo desde cero con los mismos registros
    Then las dos cuentas quedan idénticas hasta el último número
