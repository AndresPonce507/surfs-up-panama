# Surfs Up Panama

A free, open-source surf forecast that tells you where to surf today, and publishes whether
it was right.

Starting in Panama. Built to go anywhere.

**Status: pre-build.** Research and product decisions are done. No code yet.

---

## Why

There is a WhatsApp group in Panama with around 500 surfers in it. All day they post photos
and clips of the waves at different beaches so everyone knows which spot is worth the drive.
That group is the best surf forecast in the country right now.

It exists because forecasts lie. The tracker says clean, 1.5 metres, light offshore. You drive
two hours. It is blown out. Every surfer has this story.

But a chat group has no memory. Photos scroll past and vanish. In a year that group will know
exactly as much as it knows today.

**The group is a sensor network that nobody is recording.** That is the whole idea.

## How it works

Four layers. Only one of them is AI, and it is not the one that makes the forecast accurate.

**1. Data.** Four independent global wave models (NOAA GFS-Wave, ECMWF IFS, ECMWF AIFS, DWD
GWAM), real tide from NOAA tide stations, real hourly wind from airport observations. All free,
all public domain or openly licensed. Pulled hourly, written down permanently, never overwritten.

**2. Physics.** A deterministic score per spot. Does the swell direction fit this break's window,
is the wind actually offshore for this shore angle, is the tide in this spot's range. Plain
arithmetic. No AI. Fully explainable, so the site can always answer *why*.

**3. Learning.** People report what it was really like. We join that back to what each model
predicted and learn how each one is wrong at each specific break. Roughly 10 to 30 honest
reports per spot is enough to start beating the raw model there.

**4. Language.** A model writes the daily call, explains the reasoning, and says plainly when it
does not know. It narrates. It does not compute the score. If you deleted it tomorrow the site
would be less pleasant and exactly as accurate.

## What makes it different

No competitor publishes how accurate their forecast turned out to be. Not Surfline, not
Windguru, none of them.

This one keeps the receipts and shows them inline, on every spot:

> Last 30 days: we called this spot right 24 out of 31. GFS-Wave has been running 25% big here,
> so we are discounting it.

## What we will not claim

- **Not "perfect."** Not reachable, and the claim is self-harming. It sets up exactly the broken
  promise that made surfers distrust forecasts in the first place.
- **Not "AI predicts the waves."** It does not. We correct a physical model's known local errors
  and explain its uncertainty.
- **No accuracy claim on day one.** There is no data yet. The claim becomes earnable at 10 to 30
  reports per spot, and not before.

The honest ceiling: *meaningfully better than any single forecast at the spots our community
actually reports on, and never better than the disagreement between two good surfers watching
the same session.*

## Repo layout

```
BRIEF.md                          scope, constraints, and the one non-negotiable decision
docs/DISCUSS-decisions.md         31 product decisions with their reasoning
docs/surfs-up-panama-vision.html  the vision deck
docs/research/raw/                12 research documents, ~8,400 lines, all cited
docs/design/                      architecture designs (skeletons only, not yet written)
```

Start with `BRIEF.md`, then `docs/DISCUSS-decisions.md`.

## The one thing that has to be right in version one

**Every prediction gets written down at the moment it is made.**

Forecast archives are not retrievable after the fact. You cannot go back and ask what the model
said last Tuesday. If today's forecast overwrites yesterday's, there is nothing to compare
reality against and the learning loop is impossible, permanently.

It costs almost nothing to do and it cannot be added later.

## Planned stack

Astro, static output, under 100KB, offline-capable. Precomputed JSON on the read path, no
database in front of a page view. AWS: S3, CloudFront, Lambda Function URLs, DynamoDB for the
small dynamic surface. Target running cost is a few cents a month.

Mobile web only. Not an app.

## Data sources and attribution

| Source | Provides | License |
|---|---|---|
| NOAA GFS-Wave | Swell height, period, direction | Public domain |
| ECMWF Open Data (IFS + AIFS) | Independent wave and wind forecast | CC BY 4.0 |
| DWD GWAM | Fourth independent wave estimate | Open data |
| NOAA CO-OPS | Tide predictions | Public domain |
| Aviation METAR | Measured coastal wind | Public domain |
| Open-Meteo | Convenience API over the above | Free for non-commercial use |

This project is free, ad-free and unmonetized, which is what keeps it inside Open-Meteo's
non-commercial terms.

## License

MIT. See [LICENSE](LICENSE).
