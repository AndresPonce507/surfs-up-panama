@feature-f-tell-me-when-its-worth-the-drive
Feature: Lo que el servidor decide cuando alguien pide avisos

  El servidor no ejecuta nada al recibir una petición de avisos: decide. Decide
  si el destino es de un servicio de avisos conocido, si ese teléfono todavía
  tiene cupo del día, y qué queda guardado. Pedirlo dos veces desde el mismo
  teléfono para el mismo spot deja una sola suscripción, nunca dos. Y cancelar
  algo que ya no está no es un error.

  @slice-01 @driving_port @in-memory @covers-R10 @covers-R11
  Scenario: Pedir avisos dos veces del mismo spot desde el mismo teléfono deja una sola suscripción
    Given un surfista que pide avisos de Playa Venao en español desde su teléfono
    When ese mismo teléfono vuelve a pedir avisos del mismo spot
    Then queda una sola suscripción para ese spot y ese teléfono
    And esa suscripción guarda el idioma del surfista, su barra, el día del último aviso, el día del último seguimiento, y de qué teléfono vino

  @slice-01 @driving_port @in-memory @negative @error @covers-R12
  Scenario: Un destino que no es de un servicio de avisos conocido se rechaza en voz alta
    Given un surfista que pide avisos de Playa Venao desde un destino que no es de ningún servicio de avisos conocido
    Then el servidor rechaza la petición
    And el rechazo nombra el destino, dice por qué se rechaza, y dice cómo suscribirse de verdad
    And nada queda guardado

  @slice-01 @driving_port @in-memory @negative @error @covers-R12
  Scenario: Un destino sin conexión segura se rechaza igual
    Given un surfista que pide avisos de Playa Venao desde un destino sin conexión segura
    Then el servidor rechaza la petición
    And nada queda guardado

  @slice-01 @driving_port @in-memory @negative @error @covers-R13
  Scenario: Un teléfono que pasa su cupo del día deja de escribir suscripciones
    Given un teléfono que ya usó su cupo de escrituras de suscripción del día
    When ese teléfono pide avisos de Playa Venao una vez más
    Then el servidor rechaza la petición por cupo del día
    And nada queda guardado

  @slice-01 @driving_port @in-memory @covers-R14
  Scenario: Cancelar avisos que ya no están sigue siendo un final normal
    Given un surfista que ya quitó sus avisos de Playa Venao
    When ese mismo surfista vuelve a quitarlos
    Then el servidor responde que quedó sin avisos, sin tratarlo como un error
