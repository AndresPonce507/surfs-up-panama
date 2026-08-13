# ADR: Spread climatology activates after 30 completed spot-local days

**Status:** Accepted, 2026-08-10
**Context:** Trust Slice 05 / `C_spread`

## Decision

The spot-specific spread comparison is available only after **30 distinct,
completed spot-local forecast days** in that same spot's immutable
PublishedCall history. The call currently being prepared never contributes to
its own reference distribution.

A qualifying day has usable multi-source spread. The historical reader takes
one canonical dawn PublishedCall receipt per region day, validates its
spot-local date and receipt shape, and derives the existing absolute spread
penalty from its published spread terms. It never pools spots, backfills
history, or turns an absolute split into a claim that conditions are worse
than usual.

At fewer than 30 valid days, the result is the existing absolute form and the
normal-comparison sentence remains unavailable. Missing, unreadable,
malformed, wrongly scoped, or duplicate-grain history is a failure, not thin
history, and must fail closed at the composition boundary when that dormant
source is wired.

`30` is a reversible data-availability policy. It is not a calibration or
forecast-skill claim. The existing spread-factor kill switch remains separate:
when that factor is disabled, neither absolute nor climatological spread is
used.

## Current live condition

The live S3 archive has only two date partitions. This is below the 30-day
condition, so Slice 05 remains dark and current public confidence copy is
unchanged.
