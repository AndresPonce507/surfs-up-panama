# Controlled learning declarations

Four prepared source universes. They exist so the two safety rules of
`no-correction-can-be-applied-without-the-gate.feature` are watched REFUSING a
universe that breaks them as well as ACCEPTING one that keeps them. A rule that
has only ever been seen passing on the shipped source proves nothing, and the
wind rule in particular exists because its gap once opened by silence
(`06-learning-layer.md` section 8).

None of these files is production code, none is ever imported by a test, and
none may be copied into `src/`. They are inert declarations read as text by
`evaluateLearningDeclarations({ root })`.

| Universe | What it declares | Expected verdict |
|---|---|---|
| `applied-marked-only-inside-the-gate` | The gate marks a correction applied; the emitter passes the gate's verdict through | accepted |
| `applied-marked-outside-the-gate` | The emitter marks a correction applied on its own, bypassing the gate | refused, rule `only-the-gate-may-mark-a-correction-applied` |
| `wind-residual-with-its-own-noise-floor` | A wind residual form, plus a wind noise floor derived from how often the wind word itself is misread | accepted |
| `wind-residual-without-a-noise-floor` | A wind residual form and no wind noise floor at all | refused, rule `a-wind-residual-must-bring-its-own-noise-floor` |

## What counts as a marking site

A marking site is a place that can produce the applied state from anything other
than the gate's own verdict. In this project's source that is the literal
`applied: true`, or the literal gate token `'applied'` constructed outside the
gate module. Passing a gate verdict through (`applied: verdict.applied`) is not a
marking site: it cannot invent the state, only carry it.

## What the wind rule requires

If a universe declares a wind residual form, it must also declare a noise floor
for wind whose `derived_from` names the confusion structure of the wind label
itself, never a value borrowed from height. Height metres are the wrong shape for
a three-word categorical label, and `06-learning-layer.md` section 8 makes the
floor a precondition of the wind significance gate rather than a follow-up.
