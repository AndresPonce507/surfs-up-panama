@feature-f-looks-like-the-ocean-and-reads-in-the-sun
Feature: La surfista empieza a leer en claro y puede escoger oscuro

  La primera visita no adivina por el teléfono: empieza clara para que la lectura al sol sea
  inmediata. En la esquina superior izquierda hay un control que explica en el idioma de la ruta
  cuál tema activará. La elección de la persona se conserva al recargar y al recorrer las rutas
  en español e inglés. Sin automatismos del navegador, el pronóstico sigue siendo claro y legible.

  @slice-07 @step-07-01 @walking_skeleton @driving_port @real-io @ui-u1 @ui-u2 @ui-u3 @ui-u4 @ui-u5 @ui-u6 @ui-u7
  Scenario: La surfista abre cualquier ruta sin elección previa y empieza a leer en claro
    # Entornos cubiertos: publicación limpia; publicación con la revisión instalada; publicación con una elección anterior.
    Given la publicación real se construye y se abre en los entornos de lectura admitidos
    When la surfista abre la portada sin haber elegido un tema
    Then la página empieza clara aunque el teléfono prefiera oscuro, sin una pantalla de otro tema antes de leer
    And el control de tema queda arriba a la izquierda, mide por lo menos 44 píxeles y anuncia "Activar modo oscuro"
    And el control y cada ruta publicada conservan texto legible, ritmo de lectura, movimiento reducido y ningún desborde a 390 y 320 píxeles

  @slice-07 @step-07-01 @driving_port @real-io @ui-u1 @ui-u2 @ui-u3 @ui-u4 @ui-u5 @ui-u6 @ui-u7
  Scenario: La surfista elige oscuro y su elección la acompaña en español e inglés
    Given la publicación real se construye y se abre en los entornos de lectura admitidos
    When la surfista activa el modo oscuro, recarga y sigue una ruta en español y su gemela en inglés
    Then la lectura y el borde del navegador siguen el modo oscuro elegido en cada ruta
    And el control anuncia "Activar modo claro" en español y "Switch to light mode" en inglés
    And al volver a claro la elección se conserva después de otra recarga

  @slice-07 @step-07-01 @driving_port @real-io @ui-u1 @ui-u2 @ui-u4 @ui-u5 @ui-u6 @ui-u7
  Scenario: La surfista sin automatismos del navegador sigue leyendo una publicación clara
    Given la publicación real se construye para leer sin automatismos y el teléfono prefiere oscuro
    When la surfista abre la portada y una ruta de playa
    Then ambas llegan listas, claras, legibles y sin movimiento antes de que exista una elección guardada

  @slice-07 @step-07-01 @driving_port @real-io @negative @error @ui-u1 @ui-u2 @ui-u4 @ui-u5 @ui-u6 @ui-u7
  Scenario: Una elección anterior que ya no se entiende vuelve a una lectura clara
    Given la surfista trae una elección anterior que el sitio no entiende y el teléfono prefiere oscuro
    When la surfista abre la portada
    Then la portada vuelve a una lectura clara y el control ofrece activar oscuro

  @slice-07 @step-07-01 @driving_port @real-io @negative @error @ui-u7
  Scenario: Una publicación cuyo borde del navegador no sigue el tema elegido se rechaza antes de publicar
    Given una copia aislada de la publicación conserva la lectura oscura pero pinta un borde claro
    When la surfista abre esa copia en oscuro
    Then la comprobación rechaza la copia y nombra el fondo de lectura que el borde abandonó
