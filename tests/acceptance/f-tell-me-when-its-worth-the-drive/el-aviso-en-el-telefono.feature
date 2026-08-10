@feature-f-tell-me-when-its-worth-the-drive
Feature: El aviso llegando al teléfono

  Cuando el aviso llega al teléfono, se muestra. Siempre. Un aviso que llega y
  no se muestra le cuesta al surfista la suscripción entera, porque los
  navegadores castigan el silencio quitándola, y una suscripción quitada es una
  promesa rota que nadie ve. Dos avisos del mismo spot no se apilan: el nuevo
  reemplaza al anterior, que es la misma regla de no fastidiar. Y para
  mostrarlo no hace falta red ni guardar nada, que es lo que hace que las dos
  cosas que nadie verificó del iPhone no puedan romper esto.

  @slice-01 @driving_port @in-memory @covers-R24
  Scenario: Cada aviso que llega se muestra, ninguno llega en silencio
    Given un aviso de Playa Venao llegando al teléfono
    When el teléfono lo recibe
    Then el teléfono muestra ese aviso con su título y su texto
    And el teléfono espera a que el aviso esté mostrado antes de darse por terminado

  @slice-01 @driving_port @in-memory @covers-R25
  Scenario: Dos avisos del mismo spot no se apilan, el nuevo reemplaza al anterior
    Given un aviso de Playa Venao llegando al teléfono
    And el teléfono ya lo mostró
    When llega un segundo aviso del mismo spot
    Then los dos avisos van agrupados bajo el mismo spot, así que el segundo reemplaza al primero

  @slice-01 @driving_port @in-memory @negative @error @covers-R26
  Scenario: Mostrar el aviso no pide red ni guarda nada
    Given un aviso de Playa Venao llegando al teléfono
    When el teléfono lo recibe
    Then el teléfono no pidió nada a la red para mostrarlo
    And el teléfono no guardó ni leyó nada en su almacenamiento

  @slice-01 @driving_port @in-memory @covers-R27
  Scenario: Tocar el aviso lleva a la página del spot sin abrir una segunda ventana
    Given un aviso de Playa Venao ya mostrado en el teléfono
    And el surfista ya tiene abierta la página de ese spot
    When el surfista toca el aviso
    Then el aviso se cierra
    And el teléfono trae al frente la ventana que ya estaba en esa página, sin abrir otra

  @slice-01 @driving_port @in-memory @covers-R27
  Scenario: Tocar el aviso abre la página del spot cuando no hay ninguna ventana abierta
    Given un aviso de Playa Venao ya mostrado en el teléfono
    And el surfista no tiene ninguna ventana abierta del sitio
    When el surfista toca el aviso
    Then el teléfono abre una ventana en la página de ese spot
