# Theme choice RED classification

Base: `origin/main` `12dd5a039a9b0c52f413b158219edb29173b9dc2`
Command: `npm run test:at -- --tags '@feature-f-looks-like-the-ocean-and-reads-in-the-sun and @slice-07 and @step-07-01'`

| Scenario | Classification | Evidence |
|----------|----------------|----------|
| La surfista abre cualquier ruta sin elección previa y empieza a leer en claro | `MISSING_FUNCTIONALITY` | A dark-preference phone renders `rgb(6, 26, 33)` while the same unchosen light phone renders `rgb(242, 248, 250)`. The built site and both browser engines were reached before the assertion. |
| La surfista elige oscuro y su elección la acompaña en español e inglés | `MISSING_FUNCTIONALITY` | The built reading surface has zero `[data-theme-toggle]` controls, so a surfer cannot choose or preserve a theme. |
| La surfista sin JavaScript sigue leyendo una publicación clara | `MISSING_FUNCTIONALITY` | In a real JavaScript-off Chromium context with a dark device preference, the reading surface renders `rgb(6, 26, 33)` rather than its light `rgb(242, 248, 250)` counterpart. |
| Una elección anterior que ya no se entiende vuelve a una lectura clara | `MISSING_FUNCTIONALITY` | A real browser context with the invalid stored value `no-es-un-modo` and a dark device preference renders `rgb(6, 26, 33)` rather than recovering the light `rgb(242, 248, 250)` reading surface. |
| Una publicación cuyo borde del navegador no sigue el tema elegido se rechaza antes de publicar | `GREEN_NEGATIVE_CONTROL` | The test alters only the isolated Astro preview artifact, opens that served artifact in Chromium, and the same browser-chrome observer produces the named mismatch. Source and the worktree remain unchanged. |

No result is an import, fixture, build, missing-browser, or test-selection failure. The first
scenario is the DELIVER starting point; leave its assertion intact until the production theme
choice exists.
