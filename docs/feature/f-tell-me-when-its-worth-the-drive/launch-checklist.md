# Launch checklist — f-tell-me-when-its-worth-the-drive

Items owed at the moment the push subscribe path goes live. Opened 2026-08-12 by the A2HS copy
decision (`docs/feature/f-works-with-no-signal/feature-delta.md`, wave decision 2026-08-12,
ratified by Andres).

- [ ] **Restore the settled avisos wording on the A2HS hint**, in the same change that brings
  the subscribe path live. The settled copy is `application-architecture.md` §10, unchanged:
  "¿Quieres avisos? En iPhone: Compartir, y luego Añadir a pantalla de inicio. Sin eso, iPhone
  no deja avisar." Today the hint renders softened in `src/pages/index.astro` (home footer),
  promising only what exists: one tap away, opens without signal. The guard scenario
  ("No promise of avisos before avisos exist",
  `tests/acceptance/f-works-with-no-signal/it-opens-like-an-app.feature`) fails ANY `aviso`
  word on the home surface and must be amended in that same change, together with the slice-05
  Vera charter's negative clause
  (`docs/product/expectations/f-works-with-no-signal/a-surfer-adds-the-site-to-their-home-screen-and-it-opens-like-an-app-installable-with-the.md`).
  Ownership note: Andres's 2026-08-12 ruling named the slice-04 launch checklist as owner; on
  main, the roadmap step that renders the settled words is 02-02 ("The zero-JS iPhone
  disclosure says the settled words"). Whichever slice actually ships the live subscribe path
  owns this restore.
