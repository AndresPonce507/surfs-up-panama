# La razón dice en cuál cosa los modelos no se ponen de acuerdo, no solo que "coinciden en parte"
ID: EXP-f-know-how-much-to-trust-it-1 · Spec rows: slice-01 · Persona: Surfista decidiendo si maneja dos horas, que ya sabe que un 15 s y un 10 s son dos días distintos

## Intent
Cuando el surfista abre la razón de confianza, no lee una frase genérica. Lee en cuál cosa los
modelos coinciden y en cuál no: el tamaño, el período o la dirección. Eso es lo que le sirve para
decidir. "Coinciden en el tamaño pero no en el período" le dice que si pega el swell largo, se
prende; "coinciden en todo" le dice que el número es lo que hay. Una sola palabra vaga no le sirve
de nada.

## Preconditions
Proyecto Node 22, todo por npm scripts y navegador. No hay pytest ni cargo. Todo se corre desde el
árbol bajo prueba: primero `cd /Users/andres/psb-multimodel-trust`, y cualquier otra ruta va
absoluta. Si una observación sale de otra raíz, se descarta y se repite desde aquí, nunca se
reporta.

1. `cd /Users/andres/psb-multimodel-trust`
2. `npm ci` (solo la primera vez en esta máquina)
3. `npm run build`
4. `npm run preview` y anotar la URL local que imprime (normalmente `http://localhost:4321`)
5. Abrir la home y la página de Mañana en una ventana de ancho de teléfono, cerca de 390 px.

## Charter
Abrí la razón de confianza en muchas filas, no en una: en Hoy y en Mañana, arriba y abajo del
ranking. Leelas como surfista, no como programador. La pregunta filosa es: **¿esta frase me dice
algo que puedo usar, o me está diciendo "puede que sí, puede que no" con más palabras?** Buscá
específicamente si alguna fila nombra cuál cosa está floja. Después buscá lo contrario: alguna fila
que prometa acuerdo cuando en realidad no hay con qué comparar. Y fijate que las filas sigan
limpias en ancho de teléfono ahora que la frase es más larga.

## Expected observations (oracle)
- Al abrir la razón de una fila, la frase nombra cosas concretas: el tamaño, el período, la
  dirección. No se queda en "coinciden solo en parte".
- Cuando los modelos difieren en una sola cosa, la frase dice en cuál coinciden **y** en cuál no,
  en ese orden, de corrido y en español de a pie.
- Cuando los modelos coinciden en las tres cosas, la frase lo dice derecho, sin adornos.
- Toda razón sigue diciendo que todavía nadie mandó un reporte desde la playa. Ese renglón no se
  fue a ningún lado: el nivel es acuerdo entre modelos, nunca puntería comprobada.
- Las filas siguen limpias a 390 px: nada cortado, nada desbordado, el toque sigue midiendo al
  menos 44 por 44 px, y el texto se lee con contraste suficiente contra el fondo real de la
  tarjeta, en tema claro y en oscuro.
- Negative: ninguna razón puede decir que los modelos coinciden cuando en realidad solo un modelo
  alcanza a ver ese spot. En ese caso tiene que decir que no hay con qué comparar. Prometer acuerdo
  con una sola opinión es FALLA.
- Negative: ninguna razón puede mostrar un número, un porcentaje, ni una barra de certeza. La
  confianza es una palabra y una explicación, nunca una cifra calibrada.
- Negative: ninguna razón puede mostrar nombres de modelos, siglas, JSON, inglés, ni texto crudo de
  datos. "Los modelos" está bien; cualquier identificador técnico es FALLA.
- Negative: ninguna razón puede abrir vacía.

Deferred, not this slice: el historial de aciertos por spot y la frescura de reportes reales. Hoy no
existe ni un reporte en el sistema y no hay boya en el Pacífico centroamericano, así que la única
afirmación honesta es acuerdo entre modelos. No falles el slice por no saber más que eso.

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
| 2026-08-11 | Vera | PASS | Examined home (today) and tomorrow pages at 390px in light/dark themes. Opened 40 confidence disclosures across both days. All expected observations held: phrases name concrete things (tamaño, período, dirección), partial disagreement patterns explained ("coinciden en X pero no en Y"), full agreement stated directly, beach-report disclaimer present throughout, rows clean with 44px+ touch targets and no overflow. Negative requirements met: single-model cases correctly say "no hay con qué comparar", no numbers/percentages/bars shown, no model names/acronyms/JSON/English, no empty disclosures. One edge case noted (Playa Malibu today: low confidence + full model agreement due to missing wind data) is not a charter violation but presents a subtle UX pattern—the reason correctly reports model agreement while call text shows "viento sin datos", and a surfer can cross-reference to understand; this is less immediately clear than partial-disagreement cases but not incorrect. Feature delivers on core promise: confidence reasons explain what models agree/disagree on in concrete, actionable Spanish. |
