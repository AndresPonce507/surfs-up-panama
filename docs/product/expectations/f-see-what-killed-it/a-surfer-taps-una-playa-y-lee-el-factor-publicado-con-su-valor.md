# Cada causa escrita lleva su propio valor, en la misma frase y sin adivinar

ID: EXP-f-see-what-killed-it-2 · Spec rows: slice-02 step 02-04 · Persona: Surfista que ya está leyendo su playa y quiere entender cuánto pesó la causa que le bajó el día

## Intent

Al abrir una playa, el surfista lee en cada sección del día una sola frase en
español que junta la causa ya nombrada con el valor que le corresponde, por
ejemplo: `Lo que lo tumba: el viento, a 0.18.` El valor sirve para entender esa
causa, no para convertir la página en un tablero técnico. Hoy y mañana pueden
tener causas y valores distintos, y cada frase debe quedarse con los suyos.

Si una mañana antigua todavía nombra la causa pero no trae su valor, la frase
sigue completa y tranquila con solo la causa. Nunca aparece una cifra
inventada, una coma colgando, un hueco, `null`, `undefined` ni una palabra de
código. Un día sin causa sigue sin frase, como ya se ve en la página.

## Preconditions

1. Desde el árbol bajo prueba, ejecutar `npm run build`.
2. Ejecutar `npm run preview` y abrir la dirección local que anuncie.
3. Usar una ventana de teléfono de unos 390 px de ancho y entrar en una playa
   que tenga una causa escrita tanto hoy como mañana.

## Charter

En una playa con dos días distintos, lee la frase de hoy y la de mañana en voz
alta. Confirma que cada una dice una causa y una cifra de dos decimales en la
misma oración, y que no se intercambian las cifras entre los días. La frase
debe sonar como una explicación breve para decidir si surfear, no como una
nota de programador.

Busca, si la publicación ofrece un caso, una playa cuya causa todavía aparezca
pero que no tenga cifra. La oración debe seguir terminada y legible sin una
coma de más ni un espacio que parezca un dato perdido. Mira también una playa
sin causa: no debe aparecer una línea vacía ni una cifra sola.

Termina en Santa Catalina - La Punta a 390 px. Repite la lectura en tema claro
y oscuro, con movimiento reducido, y comprueba que el nombre largo, las dos
oraciones y el botón para contar si estuviste siguen enteros y cómodos de
usar. Con colores forzados o una vista en blanco y negro, la causa y su cifra
deben seguir leyéndose dentro de las palabras, sin depender de una franja,
icono o color.

## Expected observations (oracle)

- En una misma playa, hoy y mañana muestran una oración completa con su propia
  causa y su propia cifra de dos decimales. Ninguna le roba la cifra a la otra.
- La cifra vive dentro de una sola frase clara en español. Se lee como una
  razón para surfear o no, no como telemetría ni una nota de programador.
- Cuando falta solo la cifra en una mañana antigua, la causa sigue escrita en
  una oración terminada. No hay cifra inventada, puntuación rota, texto crudo
  ni un recuadro vacío. Si no hay un caso así publicado, anotarlo como no
  ejecutado, nunca como falla por no encontrarlo.
- Cuando no hay causa, no hay frase ni cifra sola. La tarjeta del día sigue
  pareciendo completa.
- En Santa Catalina - La Punta, a 390 px, las frases se leen sin corte ni
  desborde en tema claro y oscuro. Con movimiento reducido no se animan y el
  botón para contar si estuviste conserva su tamaño y su lugar.
- En una vista sin color todavía puedo decir qué causa y qué cifra leo. Si el
  significado depende solo de color, icono o posición, es una falla.
- Negative: jamás aparece `null`, `undefined`, `NaN`, palabras en inglés,
  nombres internos, llaves, corchetes, comillas, guiones largos ni una cifra
  que pertenezca al otro día.

Deferred, not this slice: la explicación de cuánto marcaría el día sin esa
causa (slice-03), las cuatro filas de valores y su hora (slice-04), y el mapa
de la rompiente (slice-05). La ausencia de esas cosas no es una falla aquí.

## Session log (append-only)

| date | examiner | verdict | observations |
|------|----------|---------|--------------|
| 2026-08-11 | Vera | PASS | Fresh source-blind candidate-local examination through the authorized emitted-dist HTTP/Chromium fixture: both light and dark examples passed at 390 px, with the named today and tomorrow reasons carrying their own published `0.18` and `0.62` values. The same two visual examples covered normal and reduced motion and all seven UI checks. The normal committed-data build predates the scalar and cannot exercise this candidate-only fixture. |
| 2026-08-11 | Vera | PASS | Fresh source-blind terminal Slice-02 candidate run: five emitted-dist HTTP/Chromium scenarios passed at 390 px. The real producer kept wind `0.64` when the same source score record carried lower tide `0.12`; the browser received only that selected scalar. Legacy named rows stayed complete without a numeric suffix, and clean plus absent rows stayed element-free. |
