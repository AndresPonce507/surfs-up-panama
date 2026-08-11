@feature-f-looks-like-the-ocean-and-reads-in-the-sun
Feature: La bandeja de reportar se lee sobre agua tropical y conserva una tarjeta sólida cuando el teléfono no pinta vidrio

  La única superficie de vidrio que hoy llega a una página construida es la bandeja fija que
  contiene el botón de reportar en una página de spot. El vidrio es una mejora: el fondo sólido
  debe seguir siendo legible si el navegador no soporta el filtro o si se reduce la transparencia.
  La tarjeta grande del primer spot sigue siendo un degradado sólido, porque es donde se lee el
  puntaje bajo el sol. La clase lang-toggle existe en CSS, pero no tiene marcado construido todavía;
  este slice registra ese hecho y no fabrica una píldora de idioma.

  @slice-02 @step-02-01 @walking_skeleton @driving_port @real-io @ui-u1 @ui-u2 @ui-u3 @ui-u4 @ui-u6 @ui-u7
  Scenario Outline: El teléfono que no puede pintar vidrio sigue leyendo la bandeja de reportar en tema <tema> y a <ancho> px
    Given una construcción real de una página de spot con las reglas de vidrio retiradas
    When el surfista abre esa página de spot a <ancho> px, con tema "<tema>"
    Then la bandeja de reportar es sólida, no usa filtro de vidrio y el botón conserva contraste real
    And la bandeja y el botón caben sin scroll horizontal, el botón alcanza el tamaño de toque y nada nuevo se mueve
    And la bandeja usa los tokens de tipo, color y espaciado del producto

    Examples:
      | tema   | ancho |
      | claro  | 390   |
      | oscuro | 390   |
      | claro  | 320   |
      | oscuro | 320   |

  @slice-02 @step-02-01 @driving_port @real-io @ui-u1 @ui-u4
  Scenario Outline: La transparencia reducida fuerza la bandeja real a su respaldo sólido en tema <tema>
    Given una construcción real de una página de spot con la regla de transparencia reducida forzada
    When el surfista abre esa página de spot a 390 px, con tema "<tema>"
    Then la bandeja de reportar es sólida, no usa filtro de vidrio y el botón conserva contraste real

    Examples:
      | tema   |
      | claro  |
      | oscuro |

  @slice-02 @step-02-01 @driving_port @real-io @negative @error
  Scenario: Una bandeja que comienza en vidrio sin respaldo sólido se detecta antes de publicar
    Given una construcción real de una página de spot cuya bandeja comienza en vidrio sin respaldo sólido
    When el surfista abre esa página de spot a 390 px, con tema "claro"
    Then la comprobación de respaldo sólido falla nombrando la bandeja y su fondo medido

  @slice-02 @step-02-01 @driving_port @real-io @ui-u5
  Scenario: La píldora de idioma aún no se inventa en el sitio construido
    Given una construcción real, sin ninguna modificación
    Then ningún elemento con la clase lang-toggle aparece en ninguna página construida

  @slice-02 @step-02-02 @driving_port @real-io @ui-u1 @ui-u2 @ui-u3 @ui-u4 @ui-u5 @ui-u6 @ui-u7
  Scenario Outline: Con vidrio disponible la bandeja real conserva contraste y deja ver el agua detrás en tema <tema>
    Given una construcción real de una página de spot, sin ninguna modificación
    When el surfista abre esa página de spot a 390 px, con tema "<tema>"
    Then la bandeja de reportar usa vidrio como mejora y el botón conserva contraste real
    And la tarjeta grande del primer spot permanece sólida, nunca de vidrio

    Examples:
      | tema   |
      | claro  |
      | oscuro |

  @slice-02 @step-02-02 @driving_port @real-io @ui-u1 @ui-u2 @ui-u3 @ui-u4 @ui-u5 @ui-u6 @ui-u7
  Scenario Outline: La bandeja principal fija de la portada muestra vidrio sobre agua y conserva su respaldo en <modo> a <ancho> px
    Given una construcción real de la portada con modo de vidrio "<modo>"
    When el surfista abre la portada para comprobar su bandeja a <ancho> px, con tema "<tema>"
    Then la bandeja principal permanece fija, visible y en modo <esperado> sobre el contenido que se desplaza
    And la tarjeta grande del primer spot permanece sólida, nunca de vidrio

    Examples:
      | modo         | esperado | tema   | ancho |
      | normal       | vidrio   | claro  | 390   |
      | normal       | vidrio   | oscuro | 390   |
      | normal       | vidrio   | claro  | 320   |
      | normal       | vidrio   | oscuro | 320   |
      | sin-soporte  | solido   | claro  | 390   |
      | sin-soporte  | solido   | oscuro | 390   |
      | sin-soporte  | solido   | claro  | 320   |
      | sin-soporte  | solido   | oscuro | 320   |

  @slice-02 @step-02-02 @driving_port @real-io @ui-u1 @ui-u2 @ui-u3 @ui-u4 @ui-u5 @ui-u6 @ui-u7
  Scenario Outline: La transparencia reducida deja una bandeja principal opaca y visible en <tema> a <ancho> px
    Given una construcción real de la portada con transparencia reducida
    When el surfista abre la portada para comprobar su bandeja a <ancho> px, con tema "<tema>"
    Then la bandeja principal permanece fija, visible y en modo solido sobre el contenido que se desplaza
    And la bandeja opaca de transparencia reducida forma un marco distinguible detrás de la acción sólida
    And la tarjeta grande del primer spot permanece sólida, nunca de vidrio

    Examples:
      | tema   | ancho |
      | claro  | 390   |
      | oscuro | 390   |
      | claro  | 320   |
      | oscuro | 320   |

  @slice-02 @step-02-03 @driving_port @real-io @ui-u1 @ui-u2 @ui-u3 @ui-u4 @ui-u5 @ui-u6 @ui-u7
  Scenario: La construcción real conserva una ruta de reportar lista, sin fabricar el control de idioma
    Given una construcción real, sin ninguna modificación
    When el surfista abre esa página de spot a 390 px, con tema "claro"
    Then la ruta de reportar está lista sin estado de carga ni control de idioma inventado
