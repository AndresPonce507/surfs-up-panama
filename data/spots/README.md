# Spot seed files

`pa-pacific.yaml` is the launch seed for Panama's Pacific coast: 23 spots, every
coordinate cited and graded. It is the input the publication builder reads
(domain-model.md section 11, schema `spot-seed/1`); content comes from
`docs/research/raw/14-panama-pacific-spot-seed-list.md`.

## Ownership: human-only, forever

**This file is never written by a machine.** It changes only by pull request,
reviewed by a person (domain-model.md section 10, SpotDefinition invariant).
The learned correction layer writes to `learned/corrections/v1/` and never
here. That separation is the whole correction model: the seed is the auditable
human baseline; deleting a correction file reverts a spot to pure seed. A
machine write to this file would destroy that audit trail. Do not add any
automation, job, or agent that edits `data/spots/`.

## Fields

| Field | Meaning |
|---|---|
| `spot_id` | Stable id, also the URL slug. Never rename |
| `lat` / `lon` | WGS84 coordinate. Never edit without a citable source |
| `confidence` | Coordinate evidence grade, see below |
| `coord_source`, `coord_accessed` | Where the coordinate came from and when |
| `country`, `admin_area`, `region_id`, `timezone`, `coast` | All data, nothing Panama-specific in the schema. `region_id` is the publication unit |
| `break_type`, `bottom` | beach / point / reef / rivermouth / mixed; sand / rock / reef / mixed |
| `shore_normal_deg` | Compass direction the break faces, out to sea. **Derived on every row** (`shore_normal_derived: true`, method and uncertainty per row). No source anywhere states it in degrees. Drives the swell-direction gate, so correct it when reports contradict it |
| `optimal_swell_dir_deg`, `swell_window_deg` | Ideal direction is sourced as a compass word; the window is derived by widening it (30 deg points/reefs, 45 deg beaches, a convention) |
| `offshore_wind_from_deg`, `offshore_wind_text` | Direction offshore wind blows from; text says when it is derived rather than sourced |
| `h_ref_m`, `s_size`, `t_min_s`, `wind_optimum`, `tide.sigma` | Scoring constants, **null everywhere**: the research produced no sourced values. Filling them without a citation poisons the seed |
| `tide.optimum` | Sourced tide preference or null; `tide_source` cites it. `range_class: macrotidal` is coast-level (Pacific Panama spring range near 7 m) |
| `skill`, `crowd`, `hazards`, `notes` | Qualitative, from research; `crowd` is thin (see open questions in research 14) |
| `source_confidence` | high / medium / low grade for the NON-coordinate parameters |
| `sources` | URLs backing the row, with access dates |

There is deliberately **no season field**: the mass source for "best month"
conflates clean wind with rideable swell (labels January best at spots that are
100% too small in January). Never import a season, consistency or star rating
from a forecast site.

## Coordinate confidence grades

- `verified` — a mapping source puts it on the correct coastline AND it
  survived a second check. Three kinds of second check exist, named per row in
  `coord_source`: a second independent coordinate within ~3 km (11 rows), a
  geometric distance check (Torío), or an existence-only corroboration
  (Morrillo, Reina — the two weakest verified rows).
- `single-source` — one citable coordinate, coastal feature type confirmed, no
  second check available.
- `unverified` — never published. If a coordinate fails a check it stays out.

Current file: 14 verified, 9 single-source.

## How to add a spot

1. A citable coordinate (OSM feature of a coastal type, or a published break
   page), plus a second independent check if you can get one. Name the district
   in `coord_source` — Panama reuses beach names and the wrong twin has been
   picked up before.
2. Grade it honestly (`verified` / `single-source`). No coordinate from memory,
   ever: this project already burned a research fleet on a remembered
   coordinate that was an inland village 100 km from the coast.
3. Mark derived values as derived (`shore_normal_derived`, method, uncertainty).
4. No secret spots (decision 16). One community member objecting is enough to
   keep a spot out.
5. Leave unresearched fields null. Open a PR; a human reviews and merges.

## Open questions that need a human

1. **Playa Duartes** — not in this file. It could not be located under that
   name in any source (OSM, surf guides, Spanish web, tourism board). Strong
   candidate, offered as a question not an answer: **Punta Duarte, La Barra,
   Mariato, Veraguas, ~7.5008N 80.9721W**, next to the Punta Duarte Garden Inn,
   ~2.3 km from Playa Morrillo. Ask: is that the place, and is it its own break
   or the same water as Morrillo (then it is an `alt_names` entry, not a spot)?
   And is it a spot people keep quiet? If so it stays out regardless.
2. **Playa Serena season** — surf-forecast labels January the best month while
   its own data shows 0% rideable days in January; a surfer's review and a
   local surf house both say April to November. Research 14 rules for April to
   November. Worth one local confirmation before any season copy ships.
3. **Size-band metre edges** — the body-height bands (waist, chest, head...)
   map to metre ranges in domain-model.md section 7.2. Those edges are a v1
   convention, not sourced. Sanity-check the Spanish labels and edges with the
   crew before the learning loop depends on them.

More human-check questions (Caracol orientation, El Toro orientation, Punta
Chame wave position, Sunset Coast wind, Mariatos naming, Las Lajas vs Playa
Jobo) are listed in research 14's "Needs a human check" section.
