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
| 2026-08-13 | Vera | INDETERMINATE | Rendered Hoy and Mañana (curl + Playwright/chromium at 390px, light+dark, localStorage theme), opened the confidence <details> on all 20 rows per page per theme, 80 row-opens total top-to-bottom incl. hero row 1 and row 20; all 40 rows carry data-level="low" and all 40 reasons name concrete tamaño/período/dirección in agree-then-disagree order, e.g. "Los modelos coinciden en el tamaño y la dirección, pero no en el período" (Playa Cambutal Hoy), 24/40 share the identical "coinciden en la dirección, pero no en el tamaño ni en el período", 11/40 read full-disagreement ("no coinciden en el tamaño ni en el período ni en la dirección"); "Todavía nadie ha mandado un reporte desde la playa en este spot..." present 40/40; zero horizontal overflow, zero empty disclosures, 44x44px+ touch targets on every summary, zero digits/%/model-name-or-JSON tokens, zero progress/meter/role=progressbar elements anywhere; normal-row contrast measured 6.92:1 light / 8.69:1 dark, hero card visually legible both themes (not computed, gradient background). Cannot render a verdict on 2 in-scope oracle rows because today's data has no example to check: no row shows any confidence level besides "low" or a "coinciden en las tres cosas" full-agreement phrase (oracle bullet 3), and no spot has single-model coverage so the "no hay con qué comparar" negative wording (Negative #1) was never triggered in either direction; separately, all 40 reasons collapsing to "Confianza baja" with 24 identical sentences gives a surfer no discriminating signal across the ranking today. Flags, not fails: <details name="confidence"> makes rows mutually exclusive on phone (opening one auto-closes the previous, so two reasons can't be compared side by side); spot page (e.g. /spots/playa-cambutal/) shows "Confianza baja." only inside the copy/WhatsApp payload with zero <details>/data-level, no openable reason, but charter names only Hoy/Mañana so not failed. des-record-examine could not run: /Users/andres/psb-multimodel-trust/roadmap.json does not exist; did not create it; charter bytes are unsealed. |
| 2026-08-13 | Vera | PASS | Fresh walk against a controlled fixture surface built to exercise the oracle, different data from the prior row's day: curl plus Playwright/chromium at 390px, light and dark via localStorage theme; opened confidence <details> on all 20 rows x Hoy/Mañana, 40 rows and 80 opens, top rank-1 to bottom rank-20 on both pages. Today's data supplies both cases the prior walk lacked: full agreement "Los modelos coinciden en el tamaño, el período y la dirección" at Playa Venao, data-level medium, both days (oracle bullet 3), and single-model "Hoy solo un modelo alcanza a ver este spot, así que no hay con qué comparar" at the rank-1 hero row, both days, correctly refusing to claim agreement (Negative#1 upheld); that hero row alone does not name tamaño/período/dirección, which is the correct carve-out and not a bullet-1 miss on the other 38 of 40 rows. Differ-in-one pattern "coinciden en el período y la dirección, pero no en el tamaño" present at Punta Brava, Santa Catalina - La Punta, Playa La Barqueta (oracle bullet 2, agree-then-disagree order held); full-disagreement pattern also present. Bullet-4 disclaimer "Todavía nadie ha mandado un reporte desde la playa..." present 40/40. Negatives: regex-scanned all 40 reason texts, zero digits, zero percent signs, zero model-name/acronym/JSON/English tokens; zero role=progressbar/meter/progress elements anywhere on either page; zero empty disclosures. Zero horizontal overflow (docScrollWidth=390 at a 390px viewport, all 4 theme x page combos); confidence-toggle touch targets measured 44x44px+ on every sampled row (e.g. 170x44). Normal-row reason text contrast measured 6.92:1 light / 8.69:1 dark against the real card background. Hero card uses a CSS gradient so automated bg-sampling fell back to body color; computed by hand instead from the served CSS variables, --hero-ink-2 #e8f7fa against gradient stops #0a3a46/#0d5866 light and #04222b/#093f4c/#0c5866 dark: worst stop still 7.34:1, clears AA, confirmed legible in screenshots both themes. Boundary path exercised: bottom-of-ranking 2-point rows, the no-comparison branch, and the rendered stale banner "Viejo. Lo último que vimos fue a las 12:48 a.m. No pudimos sacar datos nuevos esta mañana." Flags, not fails: <details name="confidence"> makes rows mutually exclusive on phone, confirmed by screenshot that opening one auto-closes the previously-opened row, so two reasons can't stay open side by side; the Mañana page's own rank-1 disclosure literally reads "Hoy solo un modelo alcanza a ver este spot..." carrying the word "Hoy" onto the tomorrow page. des-record-examine refused: exact stderr "Error: roadmap.json not found at /Users/andres/psb-multimodel-trust/roadmap.json", file does not exist, did not create it, charter bytes remain unsealed. |
