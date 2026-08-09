# Slice-03 launch seed readiness research

**Status:** ready for Slice-03 JIT DISTILL  
**Access date:** 2026-08-09  
**Scope:** establish whether the twenty-spot Pacific launch seed can be built without inventing
membership, orientation, or scoring constants.

## Questions

1. Which exact twenty Pacific spots are eligible for launch, and which existing records must be
   excluded with a source-backed reason?
2. Can every launch record receive the inputs required by the current scoring model without
   unsupported defaults?
3. Does the existing YAML seed format agree with the domain-model data contract, or is a narrow
   conversion required before Slice-03 DISTILL?

## Current repository evidence

- `data/spots/pa-pacific.yaml` contains 23 records.
- Playa Caracol declares itself unscorable until its orientation is settled.
- Playa Duartes is absent by design because research could not locate a real break under that
  name. It is dropped, not silently substituted with Punta Duarte.
- Playa Serena's season conflict is resolved in the seed notes: April to November is the swell
  season. Surf-Forecast's January label describes clean wind, while its own availability data
  records no rideable January days.
- Every base record deliberately leaves `h_ref_m`, `s_size`, `t_min_s`, `wind_optimum`, and
  `tide.sigma` null. The source-backed, explicitly provisional launch priors are therefore held
  in `data/spots/pa-pacific-launch-v1.json`, without mutating the human-owned source list.

## Source register

| Claim | Source | Reputation | Status |
|---|---|---:|---|
| Pacific launch membership | `data/spots/pa-pacific.yaml` plus research 14 | repository primary record | resolved |
| Playa Duartes identity | research 14 verdict and base-seed scope note | repository primary record | dropped: no located break |
| Playa Serena season | base-seed notes and research 10 season-methodology note | two-source synthesis | resolved: Apr-Nov swell season |
| Launch scoring priors | scoring architecture §3.1 and §3.5, sourced to research 09 §7 | documented unfit priors | resolved for v1, subject to later local calibration |

## Findings

The base list contains 23 named Pacific records. Three are excluded from the first ranking:

| Excluded record | Why it cannot join the launch twenty | Evidence |
|---|---|---|
| `playa-caracol` | Its own record says not to score until its shore orientation and swell window are settled. | `pa-pacific.yaml` record note |
| `playa-blanca-farallon` | The only descriptive source is likely for a different Playa Blanca and the record labels the source mismatch. | `pa-pacific.yaml` record note; research 10 §1 |
| `playa-el-toro` | Its east-facing mixed-exposure model is expressly low confidence and marked for human confirmation before launch. | `pa-pacific.yaml` record note; research 14 orientation method |

The remaining twenty are the established public launch set. They retain their existing identity,
coordinates, shore normal, swell window, source confidence, and tide vocabulary. The launch
policy supplies only documented priors where research is deliberately non-numeric:

- `h_ref_m: 1.3`, `s_size: 0.5`, `t_min_s: 10`.
- `wind_optimum: { u_star_kt: 5, k_on_kt: 6, k_off_kt: 15, k_cross_kt: 12 }`.
- Tide stage map: `low=0.1`, `low_mid=0.3`, `mid|mid_rising|mid_falling=0.5`,
  `mid_high=0.7`, `high=0.9`; `any` is an intentionally neutral tide factor.
- Tide width: a sand bottom receives `wide`; reef or rock receives `narrow`. This is the
  documented v1 research shape, not a claim of measured local calibration.

These values are not presented to users as local truth. They are versioned launch priors,
visible in data, and later correction data replaces them without changing code.

## Decision and handoff

The launch-list prerequisite is closed for local delivery. Slice-03 may enter JIT DISTILL with
exactly the twenty IDs in `pa-pacific-launch-v1.json`. DISTILL must prove all twenty are loaded
from data, sorted by the current scoring result, and that a changed swell changes the order. It
must also prove the three exclusion reasons remain explicit rather than becoming accidental
omissions. Do not write Slice-04 tests.
