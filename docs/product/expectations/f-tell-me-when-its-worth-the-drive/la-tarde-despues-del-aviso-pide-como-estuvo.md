# La tarde después del aviso pregunta cómo estuvo

ID: EXP-f-tell-me-when-its-worth-the-drive-3 · Spec rows: slice-03 · Persona: surfista que recibió el aviso de la mañana y puede contar cómo salió en realidad

## Intent

Después de recibir un aviso por la mañana, la surfista recibe una sola pregunta por la tarde. La pregunta no se cancela porque el mar se puso feo: esa respuesta es precisamente la que evita que solo queden recuerdos de los días buenos. Al tocarla, puede contar lo que vio sin ver el pronóstico en esa pantalla.

## Preconditions

1. Use a real Android phone or an iPhone abierto desde el icono instalado, with the production site and a real notification permission already granted.
2. Have one Playa Venao subscription that received the morning aviso today. Test once when the sea later looks bad if possible.
3. A deployed send and report path are needed. If either is unavailable, record INDETERMINATE, never PASS from a missing notification or an unsaved answer.

## Charter

Let the morning aviso arrive. In the local afternoon, look for one short question rather than another forecast. Open it. The report screen should be the ordinary cold report screen: no score and no forecast should persuade the answer. Choose the three report answers and send them. Then inspect the saved report only through the product’s authorised observation or launch evidence, to establish that this answer is identified as one the product asked for.

Repeat the afternoon part after the morning later becomes bad. Then repeat on a day or subscription that did not receive a morning aviso, and after already answering once. Do not infer a pass from waiting briefly or from a device with notification delivery disabled.

## Expected observations (oracle)

- Between 14:00 and 17:00 at Playa Venao, a surfer who received today’s morning aviso gets exactly one notification titled “¿Cómo estuvo?” with the short Playa Venao question.
- The question still arrives when the later conditions are bad. It is about what happened after the aviso, not a reward for a good day.
- Tapping it opens the report route. The report screen is cold: it does not show a score, forecast, or a hint about what answer is wanted.
- Sending the three answers reaches the normal confirmation and the saved observation is marked as a response the product solicited.
- With no morning aviso, outside the afternoon window, or after one response that day, no follow-up is expected. Mark a real observed extra question FAIL; do not mark a missing question PASS until the prerequisite state and window were observed.
- Negative: no part of this flow promises that a message arriving in a browser proves all phone delivery. Real Android and installed-iPhone delivery remains a launch smoke, and an unavailable deployed sender or report path makes the applicable observation INDETERMINATE.
- U8: the question is calm and brief. On a phone it reads as a respectful invitation to help, not a nag, error, or ad. The report opening feels like the same product journey.

## Session log (append-only)

| date | examiner | verdict | observations |
|------|----------|---------|--------------|
