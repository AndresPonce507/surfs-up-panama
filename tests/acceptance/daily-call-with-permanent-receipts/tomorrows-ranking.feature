@feature-daily-call-with-permanent-receipts
Feature: Mañana tiene su propia lista, sin fingir un tercer día

  Un surfista decide si el viaje de mañana vale la pena. La publicación conserva
  dos días civiles consecutivos, cada uno con su ranking propio. No hay un tercer
  pronóstico escondido detrás de la interfaz.

  @slice-05 @driving_port @in-memory @contract-shape:bounded-change @covers-R32
  Scenario: La publicación lleva rankings propios para hoy y mañana
    Given la costa tiene predicciones distintas para hoy y mañana
    When se publica la costa para el surfista
    Then la publicación trae exactamente hoy y mañana como días consecutivos
    And cada día conserva su propio ranking completo
    And mañana no es una fotocopia numérica de hoy

  @slice-05 @driving_port @in-memory @negative @error @contract-shape:bounded-change @covers-R32
  Scenario: La publicación se detiene en mañana
    Given la costa tiene predicciones distintas para hoy y mañana
    When se publica la costa para el surfista
    Then la publicación no promete ni contiene un tercer día

  @slice-05 @driving_port @real-io @adapter-integration @covers-R32
  Scenario: El surfista abre Mañana y ve sus propios números
    Given una superficie publicada aislada con rankings distintos para hoy y mañana
    When el surfista abre Mañana a 390 px
    Then /manana muestra el ranking y los valores de mañana
    And abrir /manana directamente muestra la misma superficie
    And la pestaña Mañana está activa, el pie es honesto y no hay tercer día
