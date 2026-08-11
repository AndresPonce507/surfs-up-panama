@feature-f-paste-the-call-into-the-group
Feature: El enlace pegado se anuncia con el spot y su puntaje

  Cuando el llamado se pega en el grupo, el enlace no queda como una
  dirección pelada: su anuncio nombra el mejor spot del día y trae su
  puntaje, en el español de Panamá, con la dirección del sitio configurado.
  Todo queda escrito en la página publicada; ningún servidor participa.

  @slice-03 @jit @jit-03-01 @driving_port @covers-R10 @covers-R28
  Scenario: El anuncio escrito cuenta completo el llamado del día
    Given un llamado listo para anunciar nombra "Playa Venao" con 76 puntos
    When se prepara el anuncio para el sitio "https://olas-registradas.example"
    Then el anuncio nombra "Playa Venao" y sus 76 puntos en el título y la descripción
    And el anuncio habla en español claro, sin texto técnico

  @slice-03 @jit @jit-03-01 @driving_port @covers-R10
  Scenario: El anuncio escrito cambia de dirección cuando cambia el sitio
    Given un llamado listo para anunciar nombra "Playa Venao" con 76 puntos
    When se prepara el anuncio para el sitio "https://otro-sitio.example"
    Then la dirección del anuncio usa el sitio "https://otro-sitio.example"

  @slice-03 @jit @jit-03-02 @driving_port @real-io @adapter-integration @covers-R10 @covers-R12
  Scenario: La página base publica el anuncio preparado
    Given una copia intacta de la mañana publicada instalada para compartir
    And un anuncio listo para publicar sobre "Playa Venao" con 76 puntos
    When la página base publica ese anuncio
    Then la publicación lleva el título, la descripción, la dirección y el idioma del anuncio

  @slice-03 @jit @jit-03-02 @driving_port @real-io @adapter-integration @negative @covers-R10
  Scenario: La página base sin anuncio conserva su cabecera
    Given una copia intacta de la mañana publicada instalada para compartir
    When la página base publica una página sin anuncio
    Then la publicación conserva su título y no inventa un anuncio

  @slice-03 @jit @jit-03-03 @driving_port @real-io @adapter-integration @covers-R10 @covers-R11
  Scenario: El anuncio del enlace nombra el mejor spot del día y trae su puntaje
    Given una copia intacta de la mañana publicada instalada para compartir
    When el surfista abre la home para compartir a 390 px, con tema "claro" y movimiento "normal"
    Then la página publicada anuncia su enlace con el mejor spot del día en el título
    And el anuncio trae el puntaje del día en su descripción
    And el anuncio declara que habla el español de Panamá

  @slice-03 @jit @jit-03-03 @driving_port @real-io @adapter-integration @negative @covers-R10 @covers-R28
  Scenario: El anuncio cuenta la misma historia que el mensaje pegado, sin texto técnico
    Given una copia intacta de la mañana publicada instalada para compartir
    When el surfista abre la home para compartir a 390 px, con tema "claro" y movimiento "normal"
    Then el anuncio nombra el mismo spot y el mismo puntaje que el mensaje de WhatsApp
    And ningún anuncio muestra nombres de modelos, campos técnicos, llaves de plantilla ni inglés

  @slice-03 @jit @jit-03-03 @driving_port @real-io @adapter-integration @negative @covers-R10
  Scenario: La dirección del anuncio deriva del sitio configurado, nunca de un nombre fijo
    Given una copia de la mañana publicada apuntada a un dominio recién registrado
    When el surfista abre la home para compartir a 390 px, con tema "claro" y movimiento "normal"
    Then la dirección que el anuncio declara deriva del sitio configurado en esa copia
    And el nombre del sitio original no aparece en ningún anuncio de la página

  @slice-03 @jit @jit-03-03 @driving_port @real-io @adapter-integration @negative @covers-R12
  Scenario: La dirección permanente de la página no carga el sello del build
    Given una copia intacta de la mañana publicada instalada para compartir
    When el surfista abre la home para compartir a 390 px, con tema "claro" y movimiento "normal"
    Then la página declara su dirección permanente limpia, sin el sello del build
    And el sello del build viaja solamente en el enlace que se comparte

  @slice-03 @jit @jit-03-03 @driving_port @real-io @adapter-integration @covers-R13
  Scenario: El anuncio no engorda el primer vuelo
    Given una copia intacta de la mañana publicada instalada para compartir
    When el surfista abre la home para compartir a 390 px, con tema "claro" y movimiento "normal"
    Then la página publicada anuncia su enlace con el mejor spot del día en el título
    And el documento de la home queda dentro de su techo del primer vuelo
