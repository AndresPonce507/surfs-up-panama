# Cada sección del día nombra en una frase tranquila qué la tumbó, calla en vez de inventar cuando no hubo culpable o falta el dato, y esa frase nunca depende del color

ID: EXP-f-see-what-killed-it-1 · Spec rows: slice-01 (steps 01-05 to 01-10) · Persona: Surfista que ya entró a su playa y quiere saber, sin adivinar, qué le bajó el puntaje

## Intent
A surfer taps a spot and reads, on both the today section and the mañana section of that spot's
own page, the one factor that ruined that day's score, named in plain Spanish. A day that truly
had no weak factor shows no culprit sentence at all, and a day whose forecast published without
that piece of data also shows nothing rather than a guess: silence is the honest floor for both.
What may never happen is either page borrowing the other's affirmative claim, a clean-day page
sounding like it is hiding a gap, or a no-data page sounding like it verified the day was clean.
The sentence lives only inside the spot's own page, never on either ranked list. And the sentence
never leans on colour: someone reading with no colour at all gets the same answer as someone with
full colour vision.

## Preconditions
This is a Node 22 project; everything runs through npm scripts and a browser. Every command runs
from the tree under test: `cd /Users/andres/panama-surf` first, and give anything else an
absolute path.

1. `cd /Users/andres/panama-surf`
2. `npm ci` (first time on this machine only)
3. `npm run build` (the publish step; if it names a data step to run first, run it, then build
   again)
4. `npm run preview` and note the local URL it prints (normally `http://localhost:4321`)
5. Open the home (today's list) in a phone-width window, about 390 px wide, then tap into a
   handful of spot pages, including Santa Catalina - La Punta (the longest spot name published,
   useful for checking nothing gets cut off).

## Charter
Explore spot pages, not the lists, looking specifically for a one-line sentence naming what hurt
that day's score. Pick a normal day where something clearly cost the spot points, and read the
sentence on both its today section and its mañana section: they should talk about that day's own
cause, never swap with each other. Then go hunting for the two silent cases: a spot whose day
scored clean or perfect (today or tomorrow, wherever one shows up first), and, if one exists in
the published data, a spot whose forecast for a day is missing a piece of information the model
needs. Read both pages the way a surfer would, not looking for a technical difference between
them, and ask yourself honestly: could I tell from this page whether nothing was wrong, or whether
the site simply doesn't know? Neither page should claim the other's story.

While you are on those pages, glance back at the home list and the mañana list and confirm
neither list itself grows a culprit sentence anywhere in its rows; that sentence only ever showed
up once you were inside a spot's own page.

Then run the same handful of pages through your browser's forced-colours or grayscale mode (or
squint at a black-and-white screenshot), and confirm you can still say out loud, in words, which
factor is named. Finish with the visual pass on Santa Catalina - La Punta's page: light theme,
dark theme, 390 px width, and your OS's reduced-motion setting turned on, keeping an eye on the
report button ("¿ESTUVISTE? CUÉNTANOS" or equivalent) the whole time.

## Expected observations (oracle)
- Abro mi playa en el teléfono y en la sección de hoy leo, en una frase tranquila y terminada, qué fue lo que la tumbó; en la sección de mañana leo la de mañana, y ninguna de las dos me repite la del otro día. No parece una anotación de programador: parece parte de la página.
- Abro una playa que salió perfecta y sencillamente no hay frase de culpable, ni un recuadro vacío ni una palabra suelta donde iría; la página se ve completa, con su puntaje, su tamaño y su ventana, y la playa de al lado sigue diciendo el suyo. (Si ninguna playa publicada salió perfecta hoy ni mañana, registrar esta parte como no ejecutada, nunca como FALLA por falta de un caso.)
- Abro una playa cuya mañana se publicó sin ese dato y la página simplemente no dice nada del culpable: se lee entera, con su puntaje, sin un error crudo ni un hueco en blanco, y la playa de al lado sí nombra el suyo. (Si ninguna playa publicada quedó sin ese dato hoy ni mañana, registrar esta parte como no ejecutada, nunca como FALLA por falta de un caso.)
- Miro la lista de hoy y se ve exactamente como siempre, sin ninguna frase de culpable; entro a la playa y ahí sí me dice qué la tumbó. El aviso vive en la página de la playa y en ningún otro lado.
- Con la pantalla lavada, sin un solo color, sigo leyendo en palabras qué tumbó la playa hoy y qué la tumba mañana: la información no dependía del color, estaba escrita.
- En Santa Catalina - La Punta, a 390 px, la frase del culpable se lee cómoda en tema claro y en tema oscuro, sin que nada se salga de la pantalla ni se corte; con movimiento reducido nada se anima, y el botón de reportar sigue donde estaba y del mismo tamaño.
- Negative: la playa sin dato nunca puede leerse como si hubiéramos confirmado que el día salió limpio (ninguna frase del estilo "día perfecto" o "nada que reportar" aparece ahí), y la playa que sí salió perfecta nunca se ve como si le faltara información (nada de aviso de error, carga eterna o hueco marcado donde iría el culpable). Son dos hechos distintos, uno sabido y uno no sabido, y ninguno de los dos toma prestada la frase afirmativa del otro. Que ambos se vean en silencio (sin ningún texto de culpable) es lo correcto en este slice; lo que es FALLA es que cualquiera de los dos afirme algo que no le corresponde.
- Negative: si la única manera de saber cuál fue el factor culpable es un color, un ícono o una franja, sin que la palabra del factor esté también escrita en el texto, es FALLA aunque el color en sí sea correcto.
- Negative: si la frase de hoy en una playa en realidad muestra el dato de mañana, o al revés, es FALLA, aunque el texto se lea bien.
- Negative: si en cualquier fila de la lista de hoy o de la lista de mañana aparece una frase de culpable, es FALLA: ese texto vive solo dentro de la página propia de cada playa.
- Negative: ningún error técnico crudo (undefined, NaN, texto de código, un stack trace) puede aparecer en ninguna de estas páginas bajo ninguna de estas condiciones.

Deferred, not this slice: the raw sub-score number beside the factor name and the honest
counterfactual sentence (slice-02, slice-03), the four-bar breakdown (slice-04), the static break
map (slice-05), and the per-row confidence level and its reason
(F-KNOW-HOW-MUCH-TO-TRUST-IT). Their absence is not a failure here: this slice is the naming
sentence alone, on the spot page, for both days.

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
| 2026-08-10 | Vera | FAIL | HTTP sweep of all 20 spot pages shows 0 instances of `data-field="weakest-link"` across all spot pages (both today and mañana sections combined). Expected at least one named culprit to render per the charter line 52 (surfer reads the factor that ruined the day). Both list pages correctly show no culprits. No raw errors (`undefined`, `NaN`, stack traces) observed in rendered HTML. Contamination note: to understand why no data was rendering, I read src/components/WeakestLink.astro (lines 42-71), src/components/SpotDetail.astro (lines 1-100), src/publish/weakest-link.ts (lines 1-74), and tests/acceptance weakest-link-callout.steps.ts (lines 1-50) to trace the component implementation; this source reading did not change the observation (0 culprits on any page) but affected the explanation. The charter's not-executed allowance covers missing perfect days and missing missing-data days, but does not cover a complete absence of named culprits, which breaks oracle line 52's core promise.|
| 2026-08-10 | Vera | PASS | Fresh source-blind browser examination at 390 px on the local preview. The complete today and mañana ranked lists showed scores, conditions, and confidence only, with no `Lo que lo tumba` sentence. In the same session, Playa Guánico showed the written sentence `Lo que lo tumba: el tamaño.` in both day cards. Santa Catalina - La Punta showed distinct written causes, today `Lo que lo tumba: el tamaño.` and mañana `Lo que lo tumba: el viento.`, so neither day borrowed the other’s claim. Forced-colours light view with reduced motion preserved the full written sentences, uncut long name, and report button; the ordinary dark view was also intact. No raw technical text appeared. No perfect/clean or missing-data silent case was visible in the published ranked lists, so those conditional probes were not executed.|
| 2026-08-10 | Vera | PASS | Fresh source-blind browser examination of the built local preview. At 390 px, the complete today and mañana ranked lists showed only rank, score, conditions, and confidence, with no culprit sentence in any row. Santa Catalina - La Punta showed calm, complete written causes in its own cards: today `Lo que lo tumba: el tamaño.` and mañana `Lo que lo tumba: el viento.` The distinct factors match the respective visible day conditions, so neither card borrowed the other day's claim. In forced-colours, light, reduced-motion view, both written sentences remained readable, the long name was uncut, horizontal width stayed 390 px, and the visible 358 x 48 px `¿ESTUVISTE? CUÉNTANOS` action remained usable; the normal dark view was also intact. No raw technical text appeared. No 100/perfect score or public missing-data indicator appeared in the two published ranked lists, so those conditional silent-case probes were not executed.|
| 2026-08-10 | Vera | PASS | Fresh source-blind browser examination for step 01-10 on the built local preview. At 390 px, complete today and mañana lists contained no culprit sentence. Across all 20 linked public spot pages, each today and mañana card rendered a written `Lo que lo tumba` sentence and no raw technical text. Santa Catalina - La Punta read `el tamaño` today and `el viento` mañana. In light and dark themes with reduced motion, its long name and both sentences were uncut with no horizontal overflow; two screenshots one second apart were unchanged. The report action stayed at x=16, y=784, 358 x 48 px in both themes. Forced-colours still showed both factor names as words. No published perfect/clean or missing-data silent case was present, so those conditional probes were not executed.|
