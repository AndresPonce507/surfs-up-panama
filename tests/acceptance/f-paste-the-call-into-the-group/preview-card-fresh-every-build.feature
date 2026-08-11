@feature-f-paste-the-call-into-the-group
Feature: El anuncio lleva una tarjeta de verdad, rehecha en cada publicación

  El anuncio del enlace no es solo texto: lleva una tarjeta con el spot, el
  puntaje, el tamaño y la confianza. La tarjeta se rehace con cada
  publicación, así un enlace pegado a las 3 de la tarde nunca presume los
  números de las 6 de la mañana. Si a un spot le faltan campos, da la cara
  la tarjeta genérica y el hueco queda anotado; números inventados, jamás.

  @slice-04 @jit @jit-04-01 @driving_port @covers-R16
  Scenario: Una tarjeta completa conserva la historia de su spot
    Given una tarjeta lista para el spot "Playa Venao" con 76 puntos y todos sus campos
    When se elige la tarjeta de vista previa para ese spot
    Then la selección conserva la tarjeta propia de "Playa Venao" y no inventa huecos

  @slice-04 @jit @jit-04-01 @driving_port @error @covers-R16
  Scenario: Una tarjeta con campos faltantes da la cara genérica y nombra el hueco
    Given una tarjeta lista para el spot "Playa Venao" con 76 puntos pero sin "conf_level"
    When se elige la tarjeta de vista previa para ese spot
    Then la selección usa la tarjeta genérica y anota que falta "conf_level"

  @slice-04 @jit @jit-04-03 @driving_port @real-io @adapter-integration @covers-R14
  Scenario: El anuncio de la home declara su tarjeta, con las medidas y el peso acordados
    Given una copia intacta de la mañana publicada instalada para compartir
    When el surfista abre la home para compartir a 390 px, con tema "claro" y movimiento "normal"
    Then el anuncio declara una tarjeta de imagen con dirección absoluta del sitio configurado
    And esa tarjeta existe en lo publicado, con las medidas de vista previa y dentro de su techo de peso

  @slice-04 @jit @jit-04-02 @driving_port @real-io @adapter-integration @covers-R14
  Scenario: Cada spot publicado recibe su propia tarjeta en cada publicación
    Given una copia intacta de la mañana publicada instalada para compartir
    When se publica la mañana completa
    Then lo publicado trae una tarjeta de vista previa por cada spot del día
    And cada tarjeta cuenta la historia de su propio spot, ninguna cara repetida

  @slice-04 @jit @jit-04-03 @driving_port @real-io @adapter-integration @negative @covers-R15
  Scenario: Una mañana nueva rehace la tarjeta; lo viejo nunca se presenta como fresco
    Given una copia intacta de la mañana publicada instalada para compartir
    When el surfista abre la home para compartir a 390 px, con tema "claro" y movimiento "normal"
    And llega una mañana nueva con otro puntaje y se vuelve a publicar
    Then el enlace que se comparte lleva el sello de la mañana nueva, nunca el anterior
    And la tarjeta del anuncio trae los números nuevos, no los de la mañana anterior

  @slice-04 @jit @jit-04-03 @driving_port @real-io @adapter-integration @error @covers-R16
  Scenario: Cuando a un spot le faltan campos, da la cara la tarjeta genérica y el hueco queda anotado
    Given una copia intacta de la mañana publicada instalada para compartir
    When se publica la mañana completa
    And dos spots pierden sus campos del llamado y se vuelve a publicar
    Then la mañana con huecos se publica igual, sin caerse
    And los spots sin campos comparten la misma cara genérica, cosa que la mañana completa nunca hace
    And la publicación deja anotado qué spot llegó sin sus campos

  @slice-04 @jit @jit-04-03 @driving_port @real-io @adapter-integration @covers-R17
  Scenario: La tarjeta nunca viaja en el primer vuelo del surfista
    Given una copia intacta de la mañana publicada instalada para compartir
    When el surfista abre la home para compartir a 390 px, con tema "claro" y movimiento "normal"
    Then el anuncio declara una tarjeta de imagen con dirección absoluta del sitio configurado
    And abrir la home no descarga ninguna tarjeta de vista previa
    And el documento de la home queda dentro de su techo del primer vuelo
