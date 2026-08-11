# Slice-04 and Slice-05 acceptance bindings

Opened by the explicit 2026-08-11 DISTILL instruction. This is the binding
record for the existing roadmap, not a change to its delivery contracts.

| Roadmap step | Executable scenario | Driving boundary | Evidence / current state |
|---|---|---|---|
| 04-01 | El desglose llega completo desde la mañana que publicó la llamada | real production build → emitted HTML → HTTP → Chromium | RED, blocked by X9 hourly projection |
| 04-02 | Un dato ausente sigue ausente en el desglose | same | RED, blocked by X9 preserving null |
| 04-03 | Cada día lee solo la hora que explica su ventana | same | RED, blocked by X9 selector input |
| 04-04 | La flecha sigue el punto débil publicado, no la barra más baja | same | RED, blocked by X9 formatter input |
| 04-05 | El surfista lee cuatro razones de su mejor ventana sin una mentira por datos faltantes | same, 390 px | RED, blocked by X10 component mount |
| 04-06 | La playa expone sus cuatro razones sin recalcular ni inventar nada | same, 390 px | RED, blocked by X10 and X9 |
| 05-01 | Cada playa recibe un mapa con una fuente que sí podemos mostrar | same | RED, X11 accepted but manifest/asset policy is unimplemented |
| 05-02 | El mapa que abre el surfista ya viene listo, sin pedir un mosaico | same | RED, local diagram generator is unimplemented |
| 05-03 | La flecha del mapa sigue la orientación que conoce esa playa | same | RED, seed-to-asset binding is unimplemented |
| 05-04 | El surfista ve el break y hacia dónde mira sin abrir otro mapa | same, 390 px | RED, component is unimplemented |
| 05-05 | El mapa de la playa carga tarde sin pesar ni romper la página | same, 390 px | RED, host mount and X12 cache owner are absent |
| 05-06 | El surfista encuentra su break sin abrir un mapa pesado | same, 390 px | RED, X12 worker/cache seam is absent |

The fixture inputs are deliberately producer-shaped only:
`tests/acceptance/f-see-what-killed-it/fixtures/slice-04-best-window-breakdowns.json`
and `slice-05-orientation-diagrams.json`. They do not plant an element,
rendered string, image or browser outcome.

Visible steps carry `@ui-u1` to `@ui-u7`. U8 stays a source-blind observation
in the Slice-04 and Slice-05 charters, never a screenshot assertion.
