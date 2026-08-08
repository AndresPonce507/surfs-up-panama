# La home carga en menos de dos segundos con señal de playa, y un build que lo rompa revienta el CI nombrando ruta, bytes y techo
ID: EXP-daily-call-with-permanent-receipts-8 · Spec rows: slice-08 · Persona: Surfista con una rayita de señal en la arena, y el dueño del sitio leyendo el CI

## Intent
The home page loads in under two seconds on a beach 3G connection, and a build that would break that fails CI, naming the route, the measured bytes, and the ceiling.

## Preconditions
This slice has two surfaces: the gate's printed output in the terminal, and the built home page in the browser. This is a Node 22 project; everything runs through npm scripts and a browser. No pytest, no cargo. Every command runs from the tree under test: `cd /Users/andres/panama-surf` first, and give anything else an absolute path. Free witness: any `des` invocation prints `des.runtime.freshness.autoskipped` naming the root it resolved. An observation whose root is not `/Users/andres/panama-surf` gets discarded and re-run from here, never reported.

1. `cd /Users/andres/panama-surf`
2. `npm ci` (first time on this machine only)
3. `npm run build` and read the whole output: the byte gate runs with the build and prints what it measured.
4. `npm run ci:local` and read that output too: the full local gate runs every check, the byte gate among them.
5. `npm run preview`, note the local URL it prints (normally `http://localhost:4321`), and open the home in a phone-width window.

## Charter
Explore both halves of the promise. In the terminal: does the gate show its work, route by route, or does it just say OK? In the browser: load the built home and watch HOW it arrives, not just that it arrives: one paint or in dribs, complete or waiting on something. If the repo exposes the byte gate as its own command (run `npm run` with nothing after it to list the scripts), you can test its teeth: copy the built home page somewhere under `/Users/andres/panama-surf`, fatten the copy with junk text past its ceiling, run the gate against that copy, and expect a refusal naming route, bytes and ceiling. If there is no way to run the gate on a tampered page without touching source, write that in the log and move on: the red demonstration is then the build team's evidence, not yours.

## Expected observations (oracle)
- El gate termina verde mostrando su trabajo: nombra ruta por ruta los bytes medidos y el techo de cada una, y la home queda en o bajo su techo. Verde con lista, no verde mudo.
- En el navegador, la home construida aparece de un golpe: HTML completo de entrada, sin spinner, sin esqueleto de carga, sin pantalla en blanco esperando datos.
- Después de aparecer, la página se queda quieta: nada salta, nada se reacomoda, nada se mueve sin que lo pidas.
- Negative: un verde que no nombra rutas, bytes ni techos se reporta FALLA: no se distingue de un gate que nunca midió.
- Negative: la home no puede mostrar spinner, esqueleto ni quedarse en blanco esperando un fetch: llega renderizada o no llega.
- Negative: si el gate no pudo medir (no encontró el build, o una ruta se le escapó), no puede decir "todo bien": tiene que declarar qué no pudo medir. "Medí y pasa" y "no medí" jamás pueden imprimir lo mismo.

Honest bound, written so nobody over-claims: the "under two seconds on beach 3G" is attested here by bytes against ceilings on an emulated profile. If the gate output prints an emulated 3G render time, read it and log the number. The test on a real phone on real Panama signal belongs to the launch checklist, not to this session; do not fake it from a laptop on wifi.

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
