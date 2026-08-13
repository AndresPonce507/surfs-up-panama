@feature-f-know-how-much-to-trust-it
Feature: La confianza sobrevive a su único proveedor

  Hoy los cuatro modelos llegan por un solo proveedor. Si ese proveedor dice que no,
  o simplemente se apaga una mañana, la promesa de confianza muere con él. Una segunda
  fuente independiente, la rejilla pública de NOAA, entra por la misma costura de
  registro que ya existe: el archivo la guarda bajo su propia fuente, el día se publica
  con los modelos que de verdad respondieron, y una fuente oscura encoge la cuenta
  honestamente en vez de dejar la playa en blanco o inventar un miembro.

  Todos los escenarios usan capturas reales de los dos proveedores, del mismo ciclo de
  la misma mañana, con el reloj clavado en esa mañana.

  @slice-04 @driving_port @adapter-integration
  Scenario: Con el proveedor principal sano, la segunda fuente ni se consulta
    Given la playa Venao con sus coordenadas verificadas
    And el proveedor principal responde con su captura real de esta mañana
    And la fuente independiente está lista con su propia captura real
    When corre la captura horaria con el registro de dos fuentes
    Then el archivo de predicciones guarda las cuatro opiniones del proveedor principal
    And la segunda fuente no recibió ni una sola llamada
    And la respuesta cruda del principal queda archivada bajo su propio nombre

  @slice-04 @driving_port @adapter-integration
  Scenario: Cuando el principal se apaga, la fuente independiente mantiene vivo el registro
    Given la playa Venao con sus coordenadas verificadas
    And el proveedor principal no responde esta mañana
    And la fuente independiente está lista con su propia captura real
    When corre la captura horaria con el registro de dos fuentes
    Then el archivo de predicciones guarda las filas de la fuente independiente bajo su fuente y su ciclo exacto
    And cada fila trae el tamaño, el período y la dirección en las unidades de la casa, desde la celda de mar más cercana
    And la respuesta cruda de la fuente independiente queda archivada bajo su propio nombre, nunca bajo el del principal

  @slice-04 @driving_port @adapter-integration
  Scenario: Un solo modelo sobreviviente publica el día con confianza honesta
    Given la playa Venao con sus coordenadas verificadas
    And el proveedor principal no responde esta mañana
    And la fuente independiente está lista con su propia captura real
    When corre la captura horaria con el registro de dos fuentes
    And se arma y publica la mañana desde el archivo
    Then la superficie publicada trae la fila de la playa en los dos días
    And su confianza es "baja" y nunca más alta
    And su razón dice que no hay con qué comparar, nunca que los modelos coinciden

  @slice-04 @driving_port @adapter-integration @negative @error
  Scenario: Las dos fuentes oscuras no inventan ni un miembro
    Given la playa Venao con sus coordenadas verificadas
    And el proveedor principal no responde esta mañana
    And la fuente independiente tampoco responde
    When corre la captura horaria con el registro de dos fuentes
    Then el archivo de predicciones queda sin filas nuevas
    And el evento dice que la fuente de olas no estuvo disponible
    And la corrida termina completa, sin inventar un miembro ni un número

  @slice-04 @driving_port @adapter-integration @negative @error
  Scenario: La fuente independiente nunca reescribe lo que el principal ya archivó
    Given la playa Venao con sus coordenadas verificadas
    And el proveedor principal ya archivó su ciclo de esta mañana
    And luego el principal se apaga y la fuente independiente ve el mismo ciclo con otros números
    When corre la captura horaria otra vez
    Then el intento se rechaza y el archivo conserva los números que ya tenía
    And la salud registra que se rechazó una reescritura
