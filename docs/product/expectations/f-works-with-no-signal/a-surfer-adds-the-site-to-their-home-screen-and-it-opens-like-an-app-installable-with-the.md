# Un surfista agrega el sitio a su pantalla de inicio y se abre como una app: instalable con la identidad acordada, y sin prometer avisos antes de que los avisos existan
ID: EXP-f-works-with-no-signal-5 · Spec rows: slice-05 · Persona: un surfista de iPhone que quiere el pronóstico a un toque, y algún día, avisos

## Intent
A surfer adds the site to their home screen and it opens like an app: standalone, in Spanish, starting at the front page, with real icons at both settled sizes, costing nothing on a normal visit. The settled iPhone hint exists because on iPhone the installed context is the only door to alerts, but its settled words open by promising avisos, and no live way to ask for avisos exists yet. By ratified decision (2026-08-12, feature-delta wave decision) the hint renders TODAY with softened words that promise only what exists — the site one tap away, opening without signal — and the settled avisos wording returns in the same change that brings the push subscribe path live. The hint present without any aviso word is the pass.

## Preconditions
1. The built site served locally at 390 px; a phone or a browser able to install a web app (Android Chrome installs from a plain tab; iPhone needs Compartir, then Añadir a pantalla de inicio).
2. Both icons must exist in the build; they are derived from the favicon mark and flagged for Andres's eye (feature-delta Pre-requisite 6b).
3. The examiner never opens source files.

## Charter
Install it like a person who wants the forecast one tap away. Does the installed thing look and open like its own app: full screen, Spanish, front page first, a crisp icon rather than a grey letter? Then read the home page slowly. The install hint SHOULD be there ("¿Lo quieres como app?"), promising only the tap and the offline opening. The one thing that must NOT be there: any promise of avisos, any aviso word at all. Finally judge the icon with your own eye: is the mark recognisably this site, clean at both sizes?

## U8 restraint observation (verbatim from the roadmap quality contract, step 05-01)

Agrego el sitio a la pantalla de inicio y se abre como una app: a pantalla completa, en español, empezando por la portada, con su ícono nítido y no una letra gris. En la página no aparece ninguna promesa de avisos todavía. Todo se ve terminado a 390 px en tema claro y oscuro y nada se anima con movimiento reducido activado.

## Expected observations (oracle)
- El sitio se deja instalar y, ya instalado, abre a pantalla completa, en español, empezando por la portada.
- El ícono instalado es el sello del sitio, nítido, en ambos tamaños. Nunca una letra gris ni una imagen rota.
- Una visita normal no descarga ningún ícono de instalación; la portada pesa lo mismo que antes de este slice.
- La pista de instalación se ve en la portada ("¿Lo quieres como app?") y, al abrirla, explica el paso de iPhone (Compartir, y luego Añadir a pantalla de inicio) prometiendo solo lo que existe: quedar a un toque y abrir sin señal. Que falte la pista es FALLA.
- Negative: la palabra "aviso" visible en la página HOY, en cualquier forma, es FALLA: promete un camino de avisos que todavía no existe. Las palabras acordadas de avisos las enciende la función de avisos cuando su suscripción esté viva, no antes (decisión ratificada 2026-08-12, feature-delta).
- Negative: un manifest que abre en pestaña de navegador, empieza en otra ruta o habla otro idioma es FALLA contra la identidad acordada.

## Deferred, not this slice
El aviso A2HS visible con sus palabras acordadas (lo enciende F-TELL-ME-WHEN-ITS-WORTH-THE-DRIVE al traer la suscripción viva, junto con la enmienda del escenario que hoy exige su ausencia); el handler de push, las suscripciones y su copy (misma función); la ranura del aviso en la página de spot (sigue al keystone slice-06).

## Session log (append-only)
| date | examiner | verdict | observations |
|------|----------|---------|--------------|
