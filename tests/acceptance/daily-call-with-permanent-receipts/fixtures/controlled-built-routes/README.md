# Controlled built-route fixture (slice-08)

A miniature `dist/` tree. It is an explicit **test input** for the page-weight
gate and is never reported as production output.

Rules, same as the slice-02 declaration fixture next door:

- Steps copy this tree into a temporary directory and mutate the copy. The
  files here are read-only during a run and the `After` hook asserts they came
  out byte-identical.
- Every document is a regular file. No symlinks: a contained proof must not
  resolve out of its copy.
- Each document carries the anchors the steps mutate:
  `<!--contributors-->` (where oversize junk is appended) and `<head>` (where a
  render-blocking subresource is introduced).

The tree mirrors the route shapes the real build emits, one slug only:

| file | route | document ceiling |
|---|---|---|
| `index.html` | `/` | 14 KB gz |
| `manana.html` | `/manana` | 14 KB gz |
| `spots/playa-venao.html` | `/spots/{slug}` | 14 KB gz |
| `spots/playa-venao/ayer.html` | `/spots/{slug}/ayer` | 14 KB gz |
| `spots/playa-venao/reportar.html` | `/spots/{slug}/reportar` | 6 KB gz |
| `spots/playa-venao/reportado.html` | `/spots/{slug}/reportado` | 4 KB gz |

Ceilings are quoted from `docs/product/architecture/application-architecture.md`
section 4 (route map, "Doc budget (gz)") and section 5 (the 2 s arithmetic).
