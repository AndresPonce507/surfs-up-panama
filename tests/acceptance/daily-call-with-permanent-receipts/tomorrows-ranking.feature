@feature-daily-call-with-permanent-receipts
Feature: Mañana conserva su propia lista publicada

  Un surfista que decide si vale el viaje necesita números de mañana, no una
  copia silenciosa de la lista de hoy.

  @slice-05 @driving_port @real-io @adapter-integration @contract-shape:strict-two-day-surface @covers-R32
  Scenario: Mañana se construye desde su propio ranking
    Given una superficie publicada con hoy y mañana consecutivos
    When se construye la superficie estática de dos días
    Then la ruta Mañana muestra el mejor spot y puntaje propios de mañana
    And la home conserva el mejor spot y puntaje de hoy

  @slice-05 @driving_port @real-io @adapter-integration @negative @error @contract-shape:strict-two-day-surface @covers-R32
  Scenario Outline: Una superficie sin dos días honestos se rechaza antes de renderizar
    Given una superficie publicada de dos días cambiada a "<defecto>"
    When se intenta construir la superficie estática de dos días
    Then la construcción rechaza la superficie de dos días

    Examples:
      | defecto |
      | malformada |
      | sin-días |
      | cero-días |
      | un-día |
      | tres-días |
      | fechas-no-consecutivas |
      | mañana-vacía |
      | mañana-copiada |
      | días-copiados-con-alias-distinto |
