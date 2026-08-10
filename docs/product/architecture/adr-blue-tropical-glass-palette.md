# ADR: blue tropical glass palette

**Status:** Accepted (Andres, 2026-08-09)
**Supersedes:** the neutral palette in `09-design-system.md` and `src/styles/tokens.css`
**Applies:** after the current DELIVER wave lands. NOT during. See "Why not now".

## Decision

The product's visual identity is deep tropical water with a glass card over it. The saturated
gradient lives in a **band** behind the hero card, never across the whole page. The ranked list below
stays light and high-contrast.

Approved from the rendered proposal at `~/Desktop/surfs-up-panama-ui-proposal.html`, which shows both
themes against real 2026-08-09 spot data.

## Why the band and not the page

Glass only reads when there is something behind it. `backdrop-filter: blur(12px) saturate(140%)` was
already implemented at `src/styles/components.css:34` and `:266`, but the surfaces behind it were
`#FFFFFF` and `#F2F4F6`. Blurring near-white over near-white produces nothing, which is the entire
reason the shipped site reads as a plain system-font list despite having glass in the code.

Saturating the whole page would be worse, not better. The twenty-row list is what a surfer reads at
6am in direct sun; colour behind twenty rows of small text costs legibility and buys nothing.

## Tokens

Day theme:

```
--ink        #08252E     --bg       #F2F8FA     --surface   #FFFFFF
--ink-2      #3B5A63     --sunken   #E3EFF3     --hairline  #C6DAE0
--accent     #0B5F6A     --go       #0A6A2D     --on-go     #FFFFFF
--warn       #7A5200     --danger   #9E1C23
--hero-grad  linear-gradient(158deg, #0A3A46 0%, #0D5866 72%, #10707F 100%)
--glass      rgba(255,255,255,.15)
--glass-line rgba(255,255,255,.26)
--glass-blur blur(14px) saturate(150%)
```

Night theme:

```
--ink        #E4F2F5     --bg       #061A21     --surface   #0C2830
--ink-2      #9DBAC2     --sunken   #123039     --hairline  #1B424D
--accent     #6FCFDD     --go       #6ED694     --on-go     #04240F
--warn       #E3A85F     --danger   #F2848D
--hero-grad  linear-gradient(158deg, #04222B 0%, #093F4C 74%, #0C5866 100%)
--glass      rgba(255,255,255,.09)
--glass-line rgba(255,255,255,.16)
```

**The green stays green.** `--go` is not re-tinted toward teal. It is the "go surf" signal and it is
the one colour on the surface that carries meaning rather than mood.

## Contrast, computed not estimated

The design system's targets are body text >= 7:1 (the sunlight margin), all text >= 4.5:1, non-text
UI >= 3:1, measured against the real background including the gradient's lightest stop, never against
white. Every pair below was computed with the WCAG 2.x relative-luminance formula.

| Pair | Ratio | |
|---|---:|---|
| white title on gradient worst stop | 8.06 | AAA |
| `#E8F7FA` body on gradient worst stop | 7.34 | AAA |
| `#08252E` ink on page bg | 14.90 | AAA |
| `#08252E` ink on card | 15.98 | AAA |
| `#3B5A63` secondary on card | 7.42 | AAA |
| `#3B5A63` secondary on page bg | 6.92 | AA |
| `#9E1C23` danger on page bg | 7.41 | AAA |
| `#0B5F6A` link on page bg | 6.85 | AA |
| white on `#0A6A2D` go-green | 6.75 | AA |
| `#7A5200` amber on page bg | 6.45 | AA |

**The gradient's lightest stop is `#0D5866` and that value is load-bearing.** The first candidate was
`#0E5E70`, which put body text at 6.70 and failed the 7:1 sunlight margin. Darkening one step fixed
it. Do not lighten that stop without recomputing.

## Constraints this does not relax

- `backdrop-filter` stays **progressive enhancement over a solid fallback**, never the layer that
  carries legibility. It has a real GPU cost on the cheap Android phones this audience uses.
- The palette costs roughly 400 bytes gzipped. Bytes are not the constraint here; contrast is.
- Confidence and wind still pair shape with word. Colour never carries meaning alone, so a
  colour-blind reader and a washed-out screen in direct sun get the same information.
- `09-design-system.md`'s contrast table must be rewritten with these pairs, and the CI axe pass
  re-verified against built pages, before this is considered applied.

## Why not now

Nine DELIVER and DISTILL lanes were writing UI when this was approved, and their U1 to U7 acceptance
checks assert contrast against the current palette. Repalletting mid-flight breaks all nine at once.

Applying it afterwards is a token-value swap: layout, components and tests do not move. That is the
whole reason the tokens exist.

## Provenance

Rendered proposal: `~/Desktop/surfs-up-panama-ui-proposal.html` (not in the repo; it is a Desktop
artifact). The tokens above are the authority; if the file and this document disagree, this document
wins.
