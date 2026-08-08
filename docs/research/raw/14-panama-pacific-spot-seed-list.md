# Panama Pacific Coast Spot Seed List

Research date: 2026-08-08. Written for the launch seed file behind
`F-DAILY-CALL-WITH-PERMANENT-RECEIPTS` in `docs/epic/surfs-up-panama/epic-delta.md`.

Scope fixed by `docs/DISCUSS-decisions.md` 15 (Pacific coast only, roughly 20 spots) and 16
(well-known spots only). Physics and climatology live in
`docs/research/raw/10-panama-surf-spots-domain.md`. Scoring parameters follow
`docs/research/raw/09-ai-forecast-methodology.md` section 7. This file is the coordinate list
that neither of those has.

---

## Verdict

23 Pacific spots have a coordinate I am willing to publish. 14 are `verified` and 9 are
`single-source`. Of the 14, eleven have two independent coordinates that land within about 3 km
of each other, one survived a road-distance geometry check, and two (Morrillo and Reina) have
one mapping coordinate plus a separate source confirming the spot exists but not where it sits.
The biggest gap is that break orientation, the
parameter the `S_dir` gate runs on, is almost never stated as a number by anyone. Every
`theta_n_deg` in the seed file below is derived, not sourced, and I have labelled it that way
on every row.

Three coordinates in circulation are wrong and this file does not publish them. Surf-forecast.com
puts Playa Venao about 15 km east of the actual beach. Surf-forecast.com puts Morro Negrito on
an inland hamlet in Tolé district. Several coordinates in research file 10 marked `(approx.)`
are off by 9 to 28 km and should not be carried forward. Details in the conflict table.

Playa Duartes still does not exist under that name in any source. I found a strong candidate,
Punta Duarte in Mariato, Veraguas, and it is a question for the cousin, not an answer.

---

## How I checked every coordinate

The rule from `HANDOFF.md` section 7 is that a coordinate must come from a citable source or a
check I actually ran. Here is what I ran.

1. **Primary: OpenStreetMap via the Nominatim API.** Forward search restricted to
   `countrycodes=pa`. I only accepted a result whose OSM feature type is coastal
   (`natural=beach`, `natural=bay`, `natural=cape`) or a named beachfront business, and whose
   admin area matches the district the surf guides put the spot in.
2. **Cross-check: surf-forecast.com break pages.** These publish a two decimal lat/lon per
   break, which is about 1.1 km of resolution at Panama's latitude. Two decimals also means
   neighbouring breaks collapse onto the same point, so this source cannot separate spots that
   sit under a kilometre apart.
3. **Coastline sanity check.** Panama's Pacific coast sits between about 7.1°N and 8.7°N and
   west of 79.4°W. Anything at 9°N or above is Caribbean, canal or Colón. Every published row
   passes that box. For the rows I doubted I ran a Nominatim reverse geocode on the coordinate
   and read back what is actually at that point. That is the check that caught Morro Negrito.
4. **Ambiguity check.** Panama reuses beach names. A forward search for "Playa Venao" returns
   four hits, three of them near Arraiján at 8.88°N, which is a completely different Playa Venao
   near Panama City. Every row below names the district so the wrong twin cannot be picked up
   later.

Confidence markers used:

| Marker | Meaning |
|---|---|
| `verified` | A mapping source shows it on the correct coastline **and** it survived a second check. Read the next paragraph, because the second check is not the same on every row |
| `single-source` | One citable coordinate, coastal feature type confirmed, no second check available |
| `unverified` | Only candidate fails a check, or sources disagree and I cannot break the tie. Not published in the seed file |

**`verified` covers two different second checks and you should know which one ran on a given
row.** Eleven rows have a genuine second coordinate: an OSM node and a surf-forecast break page
that land within about 3 km of each other. Three rows on the Mariato coast do not. Playa Morrillo
and Playa Reina have an OSM beach node plus a separate source naming the spot, which corroborates
that the spot exists and is well known but says nothing about the coordinate. Playa Torío has an
OSM node plus a road-distance statement from a hotel with its own mapped coordinate, which is a
real geometric check. The confidence table names the check per row.

---

## The seed file

Field names are coastline-neutral. Nothing in the key set is Panama-specific. Panama only shows
up in values.

`theta_n_deg` is the compass direction the break faces, out to sea. `offshore_wind_from_deg` is
`theta_n_deg` minus 180, which is the direction offshore wind blows from. Both are stated even
though the second is derivable, because the scoring engine reads both.

```yaml
# Panama Pacific coast surf spot seed. 2026-08-08.
# coord_confidence: verified | single-source | unverified
# source_confidence: applies to the NON-coordinate parameters only
# theta_n_deg is DERIVED on every row. No source states a shore normal in degrees.

spots:

  # ---- Bay of Panama, Coronado and San Carlos corridor ----

  - id: playa-malibu
    name: Playa Malibu
    alt_names: [Malibú, Gorgona rivermouth]
    lat: 8.5577187
    lon: -79.8444761
    coord_confidence: verified
    coord_source: "OpenStreetMap natural=beach, Nueva Gorgona, Chame, Panamá Oeste, via Nominatim, accessed 2026-08-08; cross-checked against surf-forecast.com/breaks/Playa-Malibu_2 at 8.55N 79.87W, 2.9 km apart"
    coord_accessed: 2026-08-08
    region: "Panamá Oeste"
    country_code: PA
    break_type: rivermouth
    bottom: sand
    orientation_text: "not stated as words by any source; offshore wind given as northwest"
    orientation_source: "surf-forecast.com/breaks/Playa-Malibu_2, accessed 2026-08-08"
    theta_n_deg: 135
    theta_n_method: "DERIVED as sourced offshore wind (NW, 315) minus 180. Cross-checked against the coastline trend from Playa Malibu to Farallón, which runs about 235/055, giving a seaward normal of about 145. The two agree within 10 degrees."
    theta_n_uncertainty_deg: 20
    optimal_swell_dir_deg: 202
    swell_window_deg: [157, 225]
    swell_window_source: "DERIVED. Sourced ideal direction SSW (202) plus or minus 45 for a sandbar, clipped to theta_n plus or minus 90."
    offshore_wind_from_deg: 315
    offshore_wind_text: "Northwest"
    tide_pref: any
    tide_source: "surf-forecast.com: good surf at all stages of the tide, accessed 2026-08-08"
    skill: intermediate
    crowd: moderate
    hazards: ["shallow barrel", "post-rain river debris"]
    source_confidence: medium
    notes: "Named by the Panama tourism board as a Pacific Riviera surf spot. River-mouth sandbar, so the bank moves after every wet season and the learned-correction layer should be allowed to move H_ref here more than elsewhere."

  - id: playa-serena
    name: Playa Serena
    alt_names: [Serena, Coronado point]
    lat: 8.5221725
    lon: -79.8991118
    coord_confidence: verified
    coord_source: "OpenStreetMap natural=beach, Coronado, Chame, Panamá Oeste, via Nominatim, accessed 2026-08-08; cross-checked against surf-forecast.com/breaks/Playa-Serena at 8.53N 79.89W, 1.3 km apart"
    coord_accessed: 2026-08-08
    region: "Panamá Oeste"
    country_code: PA
    break_type: point
    bottom: rock
    orientation_text: "rocky right point break next to a sandy beach; offshore wind given as northwest by two sources"
    orientation_source: "surf-forecast.com/breaks/Playa-Serena and deepswell.com/surf-guide/Central-America/Panama/Playa-Serena/1751, both accessed 2026-08-08"
    theta_n_deg: 135
    theta_n_method: "DERIVED as sourced offshore wind (NW, 315) minus 180. Same corridor coastline cross-check as Playa Malibu."
    theta_n_uncertainty_deg: 20
    optimal_swell_dir_deg: 202
    swell_window_deg: [172, 225]
    swell_window_source: "DERIVED. Sourced ideal direction SSW (202) plus or minus 30 for a point break, clipped to theta_n plus or minus 90."
    offshore_wind_from_deg: 315
    offshore_wind_text: "Northwest"
    tide_pref: low-mid
    tide_source: "deepswell.com says low to mid; surf-forecast.com says best around low tide. Both accessed 2026-08-08."
    skill: mixed
    crowd: heavy
    hazards: ["rock bottom on the first section"]
    source_confidence: high
    notes: "Three sections. First is hollow and hard, third is beginner and longboard friendly. Most crowded spot in the Bay of Panama because Coronado access is easy. See the season conflict section below: this spot's best-season claim was the flagged contradiction and it is now resolved."

  - id: playa-teta
    name: Playa Teta
    alt_names: [Teta, Three Points]
    lat: 8.5068401
    lon: -79.9166689
    coord_confidence: verified
    coord_source: "OpenStreetMap natural=beach, San Carlos, Panamá Oeste, via Nominatim, accessed 2026-08-08; cross-checked against surf-forecast.com/breaks/Playa-Teta at 8.51N 79.91W, 0.8 km apart"
    coord_accessed: 2026-08-08
    region: "Panamá Oeste"
    country_code: PA
    break_type: reef
    bottom: reef
    orientation_text: "reef and point; right and better left hand reef breaks plus a left point; offshore wind given as northwest"
    orientation_source: "surf-forecast.com/breaks/Playa-Teta, accessed 2026-08-08"
    theta_n_deg: 135
    theta_n_method: "DERIVED as sourced offshore wind (NW, 315) minus 180. Same corridor coastline cross-check as Playa Malibu."
    theta_n_uncertainty_deg: 20
    optimal_swell_dir_deg: 202
    swell_window_deg: [172, 225]
    swell_window_source: "DERIVED. SSW (202) plus or minus 30 for a reef, clipped to theta_n plus or minus 90."
    offshore_wind_from_deg: 315
    offshore_wind_text: "Northwest"
    tide_pref: any
    tide_source: "surf-forecast.com: surfable at all stages of the tide, accessed 2026-08-08"
    skill: intermediate
    crowd: moderate
    hazards: ["reef bottom"]
    source_confidence: medium
    notes: "Named by the Panama tourism board as three points with incredible waves. Reef bottom means sigma_tide should be narrower here than at the sandbars nearby."

  - id: playa-el-palmar
    name: Playa El Palmar
    alt_names: [El Palmar, El Palmer, The Front]
    lat: 8.4674196
    lon: -79.9544055
    coord_confidence: verified
    coord_source: "OpenStreetMap natural=beach, El Palmar, San Carlos, Panamá Oeste, via Nominatim, accessed 2026-08-08; cross-checked against surf-forecast.com/breaks/El-Palmer at 8.46N 79.96W, 1.0 km apart"
    coord_accessed: 2026-08-08
    region: "Panamá Oeste"
    country_code: PA
    break_type: beach
    bottom: sand
    orientation_text: "beach and point; offshore wind given as northwest"
    orientation_source: "surf-forecast.com/breaks/El-Palmer, accessed 2026-08-08"
    theta_n_deg: 135
    theta_n_method: "DERIVED as sourced offshore wind (NW, 315) minus 180. Same corridor coastline cross-check as Playa Malibu."
    theta_n_uncertainty_deg: 20
    optimal_swell_dir_deg: 202
    swell_window_deg: [157, 225]
    swell_window_source: "DERIVED. SSW (202) plus or minus 45 for a beach break, clipped to theta_n plus or minus 90."
    offshore_wind_from_deg: 315
    offshore_wind_text: "Northwest"
    tide_pref: high
    tide_source: "surf-forecast.com: best around high tide, accessed 2026-08-08"
    skill: beginner
    crowd: light
    hazards: []
    source_confidence: medium
    notes: "The main surf-school beach on this coast. Named by the Panama tourism board. Surf-forecast notes it is unlikely to be too crowded."

  - id: playa-rio-mar
    name: Playa Rio Mar
    alt_names: [Río Mar, Rio Mar]
    lat: 8.4561993
    lon: -79.9691509
    coord_confidence: verified
    coord_source: "OpenStreetMap natural=beach, San Carlos, Panamá Oeste, via Nominatim, accessed 2026-08-08; cross-checked against surf-forecast.com/breaks/Rio-Mar at 8.45N 79.98W, 1.4 km apart"
    coord_accessed: 2026-08-08
    region: "Panamá Oeste"
    country_code: PA
    break_type: rivermouth
    bottom: sand
    orientation_text: "point and river-mouth sandbar; offshore wind given as northwest"
    orientation_source: "surf-forecast.com/breaks/Rio-Mar, accessed 2026-08-08"
    theta_n_deg: 135
    theta_n_method: "DERIVED as sourced offshore wind (NW, 315) minus 180. Same corridor coastline cross-check as Playa Malibu."
    theta_n_uncertainty_deg: 20
    optimal_swell_dir_deg: 202
    swell_window_deg: [157, 225]
    swell_window_source: "DERIVED. SSW (202) plus or minus 45 for a sandbar, clipped to theta_n plus or minus 90."
    offshore_wind_from_deg: 315
    offshore_wind_text: "Northwest"
    tide_pref: low
    tide_source: "surf-forecast.com: best around low tide, accessed 2026-08-08"
    skill: beginner
    crowd: moderate
    hazards: []
    source_confidence: medium
    notes: "Named by the Panama tourism board. Mellow, multiple peaks. River-mouth bank moves seasonally."

  - id: san-carlos-point
    name: San Carlos Point
    alt_names: [San Carlos]
    lat: 8.47
    lon: -79.96
    coord_confidence: single-source
    coord_source: "surf-forecast.com/breaks/San-Carlos-Point, accessed 2026-08-08. Two decimal precision only."
    coord_accessed: 2026-08-08
    region: "Panamá Oeste"
    country_code: PA
    break_type: reef
    bottom: reef
    orientation_text: "reef and point; offshore wind given as northwest"
    orientation_source: "surf-forecast.com/breaks/San-Carlos-Point, accessed 2026-08-08"
    theta_n_deg: 135
    theta_n_method: "DERIVED as sourced offshore wind (NW, 315) minus 180."
    theta_n_uncertainty_deg: 25
    optimal_swell_dir_deg: 202
    swell_window_deg: [172, 225]
    swell_window_source: "DERIVED. SSW (202) plus or minus 30 for a reef and point."
    offshore_wind_from_deg: 315
    offshore_wind_text: "Northwest"
    tide_pref: unknown
    tide_source: null
    skill: intermediate
    crowd: unknown
    hazards: ["reef bottom"]
    source_confidence: low
    notes: "Sits about 0.4 km from the El Palmar beach node. At surf-forecast's two decimal precision this spot and El Palmar are almost the same point, so the forecast inputs will be identical and only the per-spot parameters will separate them. Named by the Panama tourism board as Stanley and San Carlos are in the same cluster."

  - id: hawaiisito
    name: Hawaiisito
    alt_names: [Hawaiicito, Hawaisito]
    lat: 8.45
    lon: -79.98
    coord_confidence: single-source
    coord_source: "surf-forecast.com/breaks/Hawaiisito, accessed 2026-08-08. Two decimal precision only."
    coord_accessed: 2026-08-08
    region: "Panamá Oeste"
    country_code: PA
    break_type: point
    bottom: rock
    orientation_text: "rocky-bottom left point; offshore wind given as northwest by surf-forecast, northwest also by manglarlodge.com per research file 10"
    orientation_source: "surf-forecast.com/breaks/Hawaiisito, accessed 2026-08-08"
    theta_n_deg: 135
    theta_n_method: "DERIVED as sourced offshore wind (NW, 315) minus 180."
    theta_n_uncertainty_deg: 25
    optimal_swell_dir_deg: 202
    swell_window_deg: [172, 225]
    swell_window_source: "DERIVED. SSW (202) plus or minus 30 for a point."
    offshore_wind_from_deg: 315
    offshore_wind_text: "Northwest"
    tide_pref: mid
    tide_source: "surf-forecast.com: best around mid tide, accessed 2026-08-08"
    skill: mixed
    crowd: unknown
    hazards: ["rock bottom"]
    source_confidence: medium
    notes: "Named by the Panama tourism board. Coordinate lands within 1.2 km of the Rio Mar beach node, so the same precision caveat as San Carlos Point applies."

  - id: punta-chame
    name: Punta Chame
    alt_names: [Chame Banks, Chame]
    lat: 8.6464073
    lon: -79.7066296
    coord_confidence: single-source
    coord_source: "OpenStreetMap place=village centroid, Chame, Panamá Oeste, via Nominatim, accessed 2026-08-08. This is the village, not the break."
    coord_accessed: 2026-08-08
    region: "Panamá Oeste"
    country_code: PA
    break_type: beach
    bottom: sand
    orientation_text: "ocean-facing side of the peninsula, shaped by strong offshore wind; the kite lagoon is on the bay side"
    orientation_source: "theriderexperience.com Punta Chame spot guide, via research file 10, accessed 2026-08-08"
    theta_n_deg: 180
    theta_n_method: "DERIVED, low confidence. The Chame spit runs roughly northeast to southwest with the kite lagoon on its inner bay side, so the wave side faces roughly south. No source gives a number."
    theta_n_uncertainty_deg: 35
    optimal_swell_dir_deg: 202
    swell_window_deg: [157, 247]
    swell_window_source: "DERIVED, low confidence. Regional Bay of Panama SSW, wide window for a beach break."
    offshore_wind_from_deg: 0
    offshore_wind_text: "North, the same gap-wind jet that powers the kite lagoon"
    tide_pref: unknown
    tide_source: null
    skill: mixed
    crowd: unknown
    hazards: ["strong wind chop when the gap-wind jet is up"]
    source_confidence: low
    notes: "Published coordinate is the village centroid, so it is a locator, not the break. The wave side and the kite lagoon are different water. Only the wave side belongs in a surf ranking. Named by the Panama tourism board as Chame. Do not seed the lagoon."

  - id: playa-caracol
    name: Playa Caracol
    alt_names: [La Boca de Chame]
    lat: 8.5762804
    lon: -79.7896077
    coord_confidence: single-source
    coord_source: "OpenStreetMap landuse=residential named Playa Caracol Residences & Beach Club, Chame, Panamá Oeste, via Nominatim, accessed 2026-08-08. This is the resort polygon, not a beach node."
    coord_accessed: 2026-08-08
    region: "Panamá Oeste"
    country_code: PA
    break_type: beach
    bottom: sand
    orientation_text: "CONTESTED. Research file 10 carries a single source saying south is offshore here because the coastline bends at Chame, which would flip the regional pattern and make this a north-facing beach. No second source found."
    orientation_source: "Surfline synthesis via research file 10, single source, unconfirmed"
    theta_n_deg: null
    theta_n_method: "NOT DERIVED. The one available claim (south is offshore, so the beach faces north) contradicts the whole surrounding corridor and I could not confirm or refute it. Publishing a number here would be a guess."
    theta_n_uncertainty_deg: null
    optimal_swell_dir_deg: null
    swell_window_deg: null
    swell_window_source: null
    offshore_wind_from_deg: null
    offshore_wind_text: "CONTESTED, see orientation_text"
    tide_pref: unknown
    tide_source: null
    skill: beginner
    crowd: unknown
    hazards: []
    source_confidence: low
    notes: "DO NOT SCORE UNTIL ORIENTATION IS SETTLED. With theta_n null the S_dir gate cannot run. Either settle the orientation with a human or hold this spot out of launch. A north-facing beach behind the Chame spit would get very little Pacific swell, which is a testable claim."

  # ---- Coclé ----

  - id: playa-blanca-farallon
    name: Playa Blanca
    alt_names: [Farallón, Playa Farallón, Río Hato]
    lat: 8.3498482
    lon: -80.1493100
    coord_confidence: single-source
    coord_source: "OpenStreetMap tourism=hotel Hotel Riu Playa Blanca, Farallón, Antón, Coclé, via Nominatim, accessed 2026-08-08. Beachfront hotel node, not a beach node."
    coord_accessed: 2026-08-08
    region: "Coclé"
    country_code: PA
    break_type: beach
    bottom: sand
    orientation_text: "not stated by any source I trust; research file 10 explicitly doubts its own single source for this spot"
    orientation_source: null
    theta_n_deg: 160
    theta_n_method: "DERIVED, low confidence. Coastline trend from Playa Malibu (8.5577, -79.8445) to Farallón (8.3498, -80.1493) runs about 235/055, giving a seaward normal near 145 to 165. No source states it."
    theta_n_uncertainty_deg: 30
    optimal_swell_dir_deg: 202
    swell_window_deg: [157, 247]
    swell_window_source: "DERIVED, low confidence. Regional Bay of Panama pattern."
    offshore_wind_from_deg: 340
    offshore_wind_text: "North-northwest, derived from theta_n, not sourced"
    tide_pref: unknown
    tide_source: null
    skill: beginner
    crowd: unknown
    hazards: []
    source_confidence: low
    notes: "Research file 10 flags its own source for this spot as a probable name mismatch with a different Playa Blanca elsewhere in Central America. I did not find a better one. Mellow, mushy, beginner beach. Lowest-value row in this file; drop it first if the list has to shrink."

  # ---- Azuero peninsula, Los Santos ----

  - id: playa-venao
    name: Playa Venao
    alt_names: [Venao, Playa Venado]
    lat: 7.4320526
    lon: -80.1928532
    coord_confidence: verified
    coord_source: "OpenStreetMap natural=beach, Las Escobas del Venado, Pedasí, Los Santos, via Nominatim, accessed 2026-08-08. Corroborated by a separately mapped Playa Venao business at the same point, and by the distance check below: the OSM Pedasí town node is at 7.5298888, -80.0259726, which puts this beach 21.2 km southwest of Pedasí. The surf-forecast coordinate would put it 9.6 km from Pedasí, on the wrong side of the peninsula corner."
    coord_accessed: 2026-08-08
    region: "Los Santos"
    country_code: PA
    break_type: beach
    bottom: sand
    orientation_text: "south-facing bay; offshore wind given as north-northwest"
    orientation_source: "surf-forecast.com/breaks/Playa-Venao, accessed 2026-08-08, plus research file 10"
    theta_n_deg: 158
    theta_n_method: "DERIVED two ways, and they agree. (1) Sourced offshore wind (NNW, 337.5) minus 180 gives 157.5. (2) Coastline trend from the OSM beach nodes either side of it: Guánico to Venao runs 55/235 giving a normal of 145, Venao to Destiladeros runs 81/261 giving a normal of 172, and the mean of the two segments is 158.2. The descriptive south-facing bay wording in research file 10 would give 180, which is the outlier of the three."
    theta_n_uncertainty_deg: 25
    optimal_swell_dir_deg: 180
    swell_window_deg: [135, 225]
    swell_window_source: "DERIVED. Sourced ideal direction S (180) plus or minus 45 for a sandbar, clipped to theta_n plus or minus 90."
    offshore_wind_from_deg: 337
    offshore_wind_text: "North-northwest"
    tide_pref: mid-falling
    tide_source: "surf-forecast.com: best around mid tide when the tide is falling, accessed 2026-08-08"
    skill: mixed
    crowd: heavy
    hazards: ["dangerous rips"]
    source_confidence: high
    notes: "COORDINATE CONFLICT, RESOLVED. surf-forecast.com publishes 7.45N 80.06W for this break. That point reverse-geocodes to Los Desfiladeros, Pedasí, about 15 km east, right next to the separate Destiladeros break. Do not use the surf-forecast coordinate. Research file 10 carried the same wrong number."

  - id: playa-los-destiladeros
    name: Playa Los Destiladeros
    alt_names: [Destiladeros, Los Destiladeros]
    lat: 7.4586516
    lon: -80.0143765
    coord_confidence: verified
    coord_source: "OpenStreetMap natural=beach, Pedasí, Los Santos, via Nominatim, accessed 2026-08-08; cross-checked against surf-forecast.com/breaks/Destiladeros at 7.47N 80.00W, 2.0 km apart"
    coord_accessed: 2026-08-08
    region: "Los Santos"
    country_code: PA
    break_type: point
    bottom: rock
    orientation_text: "point break; offshore wind given as northwest"
    orientation_source: "surf-forecast.com/breaks/Destiladeros, accessed 2026-08-08"
    theta_n_deg: 135
    theta_n_method: "DERIVED as sourced offshore wind (NW, 315) minus 180. Sits just west of Punta Mala on the corner where the Azuero coast turns from east-facing to south-facing, so a southeast-facing normal is physically consistent."
    theta_n_uncertainty_deg: 25
    optimal_swell_dir_deg: 202
    swell_window_deg: [172, 225]
    swell_window_source: "DERIVED. SSW (202) plus or minus 30 for a point, clipped to theta_n plus or minus 90."
    offshore_wind_from_deg: 315
    offshore_wind_text: "Northwest"
    tide_pref: unknown
    tide_source: null
    skill: intermediate
    crowd: light
    hazards: []
    source_confidence: medium
    notes: "surf-forecast's own clean-day statistic picks July at 82 percent for this spot, not January. That is the opposite of the Bay of Panama spots and is a genuine spot-to-spot difference, not an error. See the clean-days section."

  - id: playa-el-toro
    name: Playa El Toro
    alt_names: [El Toro]
    lat: 7.5296834
    lon: -80.0025477
    coord_confidence: single-source
    coord_source: "OpenStreetMap natural=beach, Pedasí, Los Santos, via Nominatim, accessed 2026-08-08"
    coord_accessed: 2026-08-08
    region: "Los Santos"
    country_code: PA
    break_type: beach
    bottom: sand
    orientation_text: "not stated; research file 10 records mixed exposure, long-period south swell plus short-period north windswell"
    orientation_source: "deepswell.com and Surfline synthesis via research file 10, accessed 2026-08-08"
    theta_n_deg: 90
    theta_n_method: "DERIVED, low confidence. The beach node sits north of Punta Mala on the eastern side of the Azuero peninsula, facing into the Gulf of Panama, so the normal is roughly east. No source states it. The mixed south-swell plus north-windswell exposure recorded in research file 10 is what an east-facing beach here would see."
    theta_n_uncertainty_deg: 35
    optimal_swell_dir_deg: 135
    swell_window_deg: [90, 180]
    swell_window_source: "DERIVED, low confidence. Wide window because an east-facing Gulf of Panama beach picks up both wrapped south groundswell and local north windswell."
    offshore_wind_from_deg: 270
    offshore_wind_text: "West, derived from theta_n, not sourced"
    tide_pref: unknown
    tide_source: null
    skill: beginner
    crowd: light
    hazards: ["very large tidal swing"]
    source_confidence: low
    notes: "This is the one spot in the list whose orientation is completely different from its neighbours. It faces east into the Gulf of Panama while Destiladeros a few km south faces southeast and Venao faces south-southeast. If the S_dir gate treats them the same the ranking will be wrong. Worth confirming with a human before launch."

  - id: playa-cambutal
    name: Playa Cambutal
    alt_names: [Cambutal]
    lat: 7.2508628
    lon: -80.4934187
    coord_confidence: verified
    coord_source: "OpenStreetMap tourism=hotel Hotel Playa Cambutal, Cambutal, Tonosí, Los Santos, via Nominatim, accessed 2026-08-08; cross-checked against surf-forecast.com/breaks/Cambutal at 7.25N 80.49W, 0.4 km apart"
    coord_accessed: 2026-08-08
    region: "Los Santos"
    country_code: PA
    break_type: mixed
    bottom: mixed
    orientation_text: "south-facing; beach and reef, lefts and rights; offshore wind given as north"
    orientation_source: "surf-forecast.com/breaks/Cambutal, accessed 2026-08-08, plus research file 10"
    theta_n_deg: 180
    theta_n_method: "DERIVED as sourced offshore wind (N, 360) minus 180. Agrees with the descriptive south-facing wording in research file 10, so two independent statements give the same answer here."
    theta_n_uncertainty_deg: 20
    optimal_swell_dir_deg: 180
    swell_window_deg: [150, 210]
    swell_window_source: "DERIVED. Sourced ideal direction S (180) plus or minus 30 for a mixed beach and reef."
    offshore_wind_from_deg: 0
    offshore_wind_text: "North"
    tide_pref: any
    tide_source: "surf-forecast.com: surfable at all stages of the tide, accessed 2026-08-08"
    skill: mixed
    crowd: light
    hazards: ["reef sections"]
    source_confidence: high
    notes: "Research file 10 records a sourced swell size window of 0.8 to 3.0 m and a 15 to 16 second dominant period, which is the only numeric size window sourced anywhere in this list. Rarely crowded."

  - id: playa-guanico
    name: Playa Guánico
    alt_names: [Guánico, Guanico Abajo]
    lat: 7.2733268
    lon: -80.4186134
    coord_confidence: verified
    coord_source: "OpenStreetMap tourism=attraction Playa Guánico Abajo, Tonosí, Los Santos, via Nominatim, accessed 2026-08-08; cross-checked against surf-forecast.com/breaks/Playa-Guanico at 7.27N 80.42W, 0.4 km apart"
    coord_accessed: 2026-08-08
    region: "Los Santos"
    country_code: PA
    break_type: mixed
    bottom: mixed
    orientation_text: "beach and reef; offshore wind given as north"
    orientation_source: "surf-forecast.com/breaks/Playa-Guanico, accessed 2026-08-08"
    theta_n_deg: 180
    theta_n_method: "DERIVED as sourced offshore wind (N, 360) minus 180. Same south-facing Azuero coast as Cambutal, 8 km east."
    theta_n_uncertainty_deg: 20
    optimal_swell_dir_deg: 180
    swell_window_deg: [150, 210]
    swell_window_source: "DERIVED. S (180) plus or minus 30 for a mixed beach and reef."
    offshore_wind_from_deg: 0
    offshore_wind_text: "North"
    tide_pref: any
    tide_source: "surf-forecast.com: good surf at all stages of the tide, accessed 2026-08-08"
    skill: intermediate
    crowd: light
    hazards: ["reef sections"]
    source_confidence: medium
    notes: "Sits between Cambutal and Venao on the same south-facing stretch."

  # ---- Veraguas, Santa Catalina ----

  - id: santa-catalina-la-punta
    name: "Santa Catalina - La Punta"
    alt_names: [La Punta, Punta Santa Catalina, Santa Catalina]
    lat: 7.6342047
    lon: -81.2546103
    coord_confidence: verified
    coord_source: "OpenStreetMap place=hamlet Santa Catalina, Hicaco, Soná, Veraguas, via Nominatim, accessed 2026-08-08; cross-checked against surf-forecast.com/breaks/Playa-Santa-Catalina at 7.61N 81.24W, 3.1 km apart"
    coord_accessed: 2026-08-08
    region: "Veraguas"
    country_code: PA
    break_type: point
    bottom: reef
    orientation_text: "south-facing point, mostly rights; offshore wind given as north"
    orientation_source: "surf-forecast.com/breaks/Playa-Santa-Catalina, accessed 2026-08-08, plus thesurfatlas.com via research file 10"
    theta_n_deg: 180
    theta_n_method: "DERIVED as sourced offshore wind (N, 360) minus 180. Agrees with the descriptive south-facing point wording in research file 10."
    theta_n_uncertainty_deg: 30
    optimal_swell_dir_deg: 202
    swell_window_deg: [172, 232]
    swell_window_source: "DERIVED. Sourced ideal direction SSW (202) plus or minus 30 for a point break."
    offshore_wind_from_deg: 0
    offshore_wind_text: "North"
    tide_pref: mid-high
    tide_source: "research file 10, from thesurfatlas.com and coiba-island.com: mid to high, incoming. Low tide exposes the reef. Accessed 2026-08-08."
    skill: advanced
    crowd: moderate
    hazards: ["shallow reef and rock at low tide", "holds very large swell"]
    source_confidence: high
    notes: "Named by the Panama tourism board in Spanish as Punta Santa Catalina. The published coordinate is the town, and the break is within about 3 km of it. Research file 10 documents that Isla Coiba shadows the mainland coast behind it and Santa Catalina is the first point that emerges from that shadow, so a global model will over-forecast swell for anything tucked further into the lee. That is a per-spot exposure correction the learning layer will need."

  - id: punta-brava
    name: Punta Brava
    alt_names: [Punta Brava Santa Catalina]
    lat: 7.6161695
    lon: -81.2384345
    coord_confidence: verified
    coord_source: "OpenStreetMap tourism=attraction Punta Brava, Vía El Estero, Santa Catalina, Hicaco, Soná, Veraguas, via Nominatim, accessed 2026-08-08; cross-checked against surf-forecast.com/breaks/Punta-Brava at 7.62N 81.24W, 0.5 km apart"
    coord_accessed: 2026-08-08
    region: "Veraguas"
    country_code: PA
    break_type: reef
    bottom: reef
    orientation_text: "left-hand reef; offshore wind given as north"
    orientation_source: "surf-forecast.com/breaks/Punta-Brava, accessed 2026-08-08"
    theta_n_deg: 180
    theta_n_method: "DERIVED as sourced offshore wind (N, 360) minus 180."
    theta_n_uncertainty_deg: 30
    optimal_swell_dir_deg: 202
    swell_window_deg: [172, 232]
    swell_window_source: "DERIVED. SSW (202) plus or minus 30 for a reef."
    offshore_wind_from_deg: 0
    offshore_wind_text: "North"
    tide_pref: low
    tide_source: "surf-forecast.com: best around low tide. Research file 10 from thesurfatlas.com is narrower: one hour either side of low only. Both accessed 2026-08-08."
    skill: advanced
    crowd: light
    hazards: ["shallow reef", "very narrow tide window"]
    source_confidence: high
    notes: "Named by the Panama tourism board in Spanish, level experto. The one-hour-either-side-of-low window is the tightest sigma_tide in this whole list. If the tide term is modelled with a single global width this spot will score wrong most of the day."

  # ---- Veraguas, Mariato "Sunset Coast" ----
  # This coast faces WEST, not south. Its offshore wind comes from the east, not the north.
  # Do not apply the Bay of Panama regional pattern here.

  - id: playa-morrillo
    name: Playa Morrillo
    alt_names: [Morrillo, Morillo, Morrillo Break]
    lat: 7.4905439
    lon: -80.9533624
    coord_confidence: verified
    coord_source: "OpenStreetMap natural=beach, La Barra, Mariato, Veraguas, via Nominatim, accessed 2026-08-08. Corroborated by puntaduarte.com/location, which places its beachfront hotel at Punta Duarte, Morillo, Veraguas, 5 km past Torío, and by es.tourismpanama.com naming Playa Morrillo as one of five Veraguas surf beaches."
    coord_accessed: 2026-08-08
    region: "Veraguas"
    country_code: PA
    break_type: beach
    bottom: sand
    orientation_text: "no source states it in words; the local name for this stretch is the Sunset Coast, which is only true of a west-facing shore"
    orientation_source: "booksurfcamps.com and puntaduarte.com both describe this stretch as Panama's Sunset Coast, accessed 2026-08-08"
    theta_n_deg: 250
    theta_n_method: "DERIVED, cross-checked two ways that share no input. (1) Coastline trend using only the three OSM beach nodes on this stretch, Playa Reina (7.6209369, -80.9972459) to Playa Morrillo (7.4905439, -80.9533624), runs 161/341, giving a seaward normal of 251.4. (2) surf-forecast.com gives east-northeast (67.5) as the offshore wind for the Mariatos break on the same coast, implying a normal of 247.5. The two agree within 4 degrees, and method 1 does not use the Mariatos coordinate at all, so the west-facing finding does not depend on it. Segment-level normals run 237 at the Reina end and 272 at the Morrillo end, which is why uncertainty is 25 and not 20."
    theta_n_uncertainty_deg: 25
    optimal_swell_dir_deg: 200
    swell_window_deg: [160, 250]
    swell_window_source: "DERIVED. This coast takes regional south to southwest groundswell at a very oblique angle and west swell straight on. Window is wide and skewed west of the regional S/SSW because of the west-facing normal."
    offshore_wind_from_deg: 70
    offshore_wind_text: "East-northeast"
    tide_pref: unknown
    tide_source: null
    skill: advanced
    crowd: light
    hazards: ["steep, heavy, fast beach break"]
    source_confidence: medium
    notes: "The Panama tourism board in Spanish rates it intermedio to experto and calls it one of the most consistent swell zones in Panama, with international competitions. Research file 10 put this spot at 7.65N 81.15W, which is about 28 km northwest of where OSM has it. Research file 10 also inferred north-northeast offshore wind here from the regional pattern. That inference is wrong. This coast faces west."

  - id: playa-reina
    name: Playa Reina
    alt_names: [Reina]
    lat: 7.6209369
    lon: -80.9972459
    coord_confidence: verified
    coord_source: "OpenStreetMap natural=beach, Mariato, Veraguas, via Nominatim, accessed 2026-08-08. Corroborated by es.tourismpanama.com naming Playa Reina as one of five Veraguas surf beaches."
    coord_accessed: 2026-08-08
    region: "Veraguas"
    country_code: PA
    break_type: rivermouth
    bottom: sand
    orientation_text: "no source states it in words; same Sunset Coast west-facing shore as Morrillo"
    orientation_source: "derived from the same coastline trend as Playa Morrillo"
    theta_n_deg: 250
    theta_n_method: "DERIVED. Same two-method derivation as Playa Morrillo, using only OSM beach nodes for method 1. The Reina to Torío segment on its own gives a normal of 237, which is the southwesterly end of the spread on this coast."
    theta_n_uncertainty_deg: 25
    optimal_swell_dir_deg: 200
    swell_window_deg: [165, 255]
    swell_window_source: "DERIVED. Same reasoning as Playa Morrillo."
    offshore_wind_from_deg: 75
    offshore_wind_text: "East-northeast, derived, not sourced"
    tide_pref: unknown
    tide_source: null
    skill: intermediate
    crowd: light
    hazards: ["river-mouth currents"]
    source_confidence: medium
    notes: "Panama tourism board in Spanish rates it Intermedio to Experto. Sits at a river mouth, so the bank moves after the wet season."

  - id: playa-torio
    name: Playa Torío
    alt_names: [Torio, Torío]
    lat: 7.5488957
    lon: -80.9508330
    coord_confidence: verified
    coord_source: "OpenStreetMap natural=beach, Torio, Veraguas, via Nominatim, accessed 2026-08-08. Corroborated by puntaduarte.com/location, which gives the road distance from Torío to Punta Duarte as 5 km. The straight-line distance between the OSM Torío beach node and the OSM Punta Duarte hotel node is 5.8 km, which is consistent."
    coord_accessed: 2026-08-08
    region: "Veraguas"
    country_code: PA
    break_type: beach
    bottom: sand
    orientation_text: "no source states it in words; same Sunset Coast west-facing shore as Morrillo"
    orientation_source: "derived from the same coastline trend as Playa Morrillo"
    theta_n_deg: 252
    theta_n_method: "DERIVED. Same two-method derivation as Playa Morrillo, using only OSM beach nodes for method 1. Torío sits between Reina and Morrillo, so its normal is the mean of the two adjoining segments, 255."
    theta_n_uncertainty_deg: 25
    optimal_swell_dir_deg: 200
    swell_window_deg: [162, 252]
    swell_window_source: "DERIVED. Same reasoning as Playa Morrillo."
    offshore_wind_from_deg: 72
    offshore_wind_text: "East-northeast, derived, not sourced"
    tide_pref: unknown
    tide_source: null
    skill: intermediate
    crowd: light
    hazards: []
    source_confidence: low
    notes: "Coordinate is solid. Surf parameters are thin. No surf guide gives Torío its own swell, wind or tide entry, so everything except the coordinate rides on the Sunset Coast regional pattern."

  - id: mariatos
    name: Mariatos
    alt_names: [Mariato]
    lat: 7.41
    lon: -80.94
    coord_confidence: single-source
    coord_source: "surf-forecast.com/breaks/Mariatos, accessed 2026-08-08. Two decimal precision only. A Nominatim reverse geocode on this point returned only the Veraguas administrative boundary with no feature, which neither confirms nor refutes it."
    coord_accessed: 2026-08-08
    region: "Veraguas"
    country_code: PA
    break_type: reef
    bottom: reef
    orientation_text: "exposed reef break; offshore wind given as east-northeast"
    orientation_source: "surf-forecast.com/breaks/Mariatos, accessed 2026-08-08"
    theta_n_deg: 248
    theta_n_method: "DERIVED as sourced offshore wind (ENE, 67.5) minus 180. This is the only spot on the Sunset Coast where the offshore direction is actually sourced, and it is what anchors the west-facing normal for Morrillo, Reina and Torío."
    theta_n_uncertainty_deg: 20
    optimal_swell_dir_deg: 180
    swell_window_deg: [158, 240]
    swell_window_source: "DERIVED. Sourced ideal direction S (180), but the west-facing normal means south swell arrives about 68 degrees off normal, which is near the edge of the exposure window. Wide window skewed west."
    offshore_wind_from_deg: 68
    offshore_wind_text: "East-northeast"
    tide_pref: unknown
    tide_source: null
    skill: intermediate
    crowd: unknown
    hazards: ["reef bottom"]
    source_confidence: low
    notes: "surf-forecast files this break under the region label Pedasi and Vicinity, which is wrong. The coordinate is in Mariato district, Veraguas, about 101 km in a straight line from the OSM Pedasí town node at 7.5298888, -80.0259726, and much further by road around the Azuero peninsula. The coordinate looks right and the region label is a data error on their side. Its clean-day statistic picks April at 41 percent, the only spot in the list where the automated best month lands inside the real swell season."

  # ---- Chiriquí ----

  - id: playa-la-barqueta
    name: Playa La Barqueta
    alt_names: [Barqueta, La Barqueta]
    lat: 8.2993980
    lon: -82.5670155
    coord_confidence: single-source
    coord_source: "OpenStreetMap natural=beach, Guarumal, Alanje, Chiriquí, via Nominatim, accessed 2026-08-08"
    coord_accessed: 2026-08-08
    region: "Chiriquí"
    country_code: PA
    break_type: beach
    bottom: sand
    orientation_text: "not stated by any source"
    orientation_source: null
    theta_n_deg: 190
    theta_n_method: "DERIVED. Coastline trend between the two mapped Chiriquí beach nodes, La Barqueta (8.2994, -82.5670) and Playa Jobo at Las Lajas (8.1732, -81.8792), runs about 100/280, giving a seaward normal of about 190. No source states it."
    theta_n_uncertainty_deg: 30
    optimal_swell_dir_deg: 200
    swell_window_deg: [155, 245]
    swell_window_source: "DERIVED, low confidence. Regional Pacific south to southwest groundswell, wide window for a long open beach."
    offshore_wind_from_deg: 10
    offshore_wind_text: "North, derived, not sourced"
    tide_pref: unknown
    tide_source: null
    skill: beginner
    crowd: light
    hazards: ["long exposed beach with rips"]
    source_confidence: low
    notes: "Research file 10 has it as a beginner beach from thesurfatlas.com. No dedicated surf guide with swell, wind or tide data was found. Coordinate is good, parameters are not."

  - id: las-lajas
    name: Playa Las Lajas
    alt_names: [Las Lajas, Playa Jobo]
    lat: 8.1732155
    lon: -81.8791965
    coord_confidence: single-source
    coord_source: "OpenStreetMap natural=beach named Playa Jobo, Las Lajas, San Félix, Chiriquí, via Nominatim, accessed 2026-08-08. Nominatim has no feature under the exact name Playa Las Lajas; Playa Jobo is the mapped beach inside the Las Lajas locality."
    coord_accessed: 2026-08-08
    region: "Chiriquí"
    country_code: PA
    break_type: beach
    bottom: sand
    orientation_text: "not stated by any source"
    orientation_source: null
    theta_n_deg: 190
    theta_n_method: "DERIVED. Same two-node Chiriquí coastline trend as Playa La Barqueta."
    theta_n_uncertainty_deg: 30
    optimal_swell_dir_deg: 200
    swell_window_deg: [155, 245]
    swell_window_source: "DERIVED, low confidence."
    offshore_wind_from_deg: 10
    offshore_wind_text: "North, derived, not sourced"
    tide_pref: unknown
    tide_source: null
    skill: beginner
    crowd: light
    hazards: []
    source_confidence: low
    notes: "Well known as a long beach with mellow surf. No surf guide entry with numeric parameters found. The name mismatch between the locality (Las Lajas) and the mapped beach (Playa Jobo) is worth a human check."
```

---

## Coordinate confidence table

| # | Spot | Region | Lat | Lon | Coord confidence | Coordinate source |
|---|---|---|---|---|---|---|
| 1 | Playa Malibu | Panamá Oeste | 8.5577187 | -79.8444761 | verified | OSM beach node + surf-forecast.com, 2.9 km apart |
| 2 | Playa Serena | Panamá Oeste | 8.5221725 | -79.8991118 | verified | OSM beach node + surf-forecast.com, 1.3 km apart |
| 3 | Playa Teta | Panamá Oeste | 8.5068401 | -79.9166689 | verified | OSM beach node + surf-forecast.com, 0.8 km apart |
| 4 | Playa El Palmar | Panamá Oeste | 8.4674196 | -79.9544055 | verified | OSM beach node + surf-forecast.com, 1.0 km apart |
| 5 | Playa Rio Mar | Panamá Oeste | 8.4561993 | -79.9691509 | verified | OSM beach node + surf-forecast.com, 1.4 km apart |
| 6 | San Carlos Point | Panamá Oeste | 8.47 | -79.96 | single-source | surf-forecast.com only, 2 decimals |
| 7 | Hawaiisito | Panamá Oeste | 8.45 | -79.98 | single-source | surf-forecast.com only, 2 decimals |
| 8 | Punta Chame | Panamá Oeste | 8.6464073 | -79.7066296 | single-source | OSM village centroid, not the break |
| 9 | Playa Caracol | Panamá Oeste | 8.5762804 | -79.7896077 | single-source | OSM resort polygon, orientation unresolved |
| 10 | Playa Blanca / Farallón | Coclé | 8.3498482 | -80.1493100 | single-source | OSM hotel node |
| 11 | Playa Venao | Los Santos | 7.4320526 | -80.1928532 | verified | OSM beach node + distance-from-Pedasí check (21.2 km from the OSM Pedasí town node). surf-forecast conflicts by 14.6 km and is wrong |
| 12 | Playa Los Destiladeros | Los Santos | 7.4586516 | -80.0143765 | verified | OSM beach node + surf-forecast.com, 2.0 km apart |
| 13 | Playa El Toro | Los Santos | 7.5296834 | -80.0025477 | single-source | OSM beach node |
| 14 | Playa Cambutal | Los Santos | 7.2508628 | -80.4934187 | verified | OSM hotel node + surf-forecast.com, 0.4 km apart |
| 15 | Playa Guánico | Los Santos | 7.2733268 | -80.4186134 | verified | OSM attraction node + surf-forecast.com, 0.4 km apart |
| 16 | Santa Catalina, La Punta | Veraguas | 7.6342047 | -81.2546103 | verified | OSM hamlet + surf-forecast.com, 3.1 km apart |
| 17 | Punta Brava | Veraguas | 7.6161695 | -81.2384345 | verified | OSM attraction node + surf-forecast.com, 0.5 km apart |
| 18 | Playa Morrillo | Veraguas | 7.4905439 | -80.9533624 | verified, existence check | OSM beach node. No second coordinate. es.tourismpanama.com and puntaduarte.com confirm the spot exists and is well known, not where it is |
| 19 | Playa Reina | Veraguas | 7.6209369 | -80.9972459 | verified, existence check | OSM beach node. No second coordinate. es.tourismpanama.com confirms the spot exists, not where it is |
| 20 | Playa Torío | Veraguas | 7.5488957 | -80.9508330 | verified, geometry check | OSM beach node + puntaduarte.com's stated 5 km road distance to a separately mapped hotel node, measured at 5.8 km straight line |
| 21 | Mariatos | Veraguas | 7.41 | -80.94 | single-source | surf-forecast.com only, reverse check inconclusive |
| 22 | Playa La Barqueta | Chiriquí | 8.2993980 | -82.5670155 | single-source | OSM beach node |
| 23 | Playa Las Lajas / Playa Jobo | Chiriquí | 8.1732155 | -81.8791965 | single-source | OSM beach node under a different name |

Totals: **14 verified, 9 single-source, 0 unverified published.**

Of the 14 verified, **11 have two coordinates that agree** (rows 1 to 5, 11, 12, 14 to 17), one
has a geometric distance check against a second mapped feature (row 20, Torío), and two have a
mapping coordinate plus a separate source confirming the spot exists but not its position
(rows 18 and 19, Morrillo and Reina). Morrillo and Reina are the weakest of the fourteen.

Every one of the 23 sits between 7.25°N and 8.65°N and between 79.70°W and 82.57°W. That is
inside the Pacific box. Nothing is at 9°N or above, so nothing is Caribbean, canal or Colón.

### Coordinates I refused to publish

| Spot | Bad coordinate | Where it actually lands | Verdict |
|---|---|---|---|
| Morro Negrito | 8.04N, 81.72W from surf-forecast.com | Reverse-geocodes to **Mono Negrito, Quebrada de Piedra, Tolé, Chiriquí**, an inland isolated dwelling. Note the name is Mono, not Morro | Rejected. The camp is documented as sitting on islands offshore. This looks like a name-similarity geocode on the wrong feature |
| Punta Burica | 8.0427N, 82.8673W from OSM | A `highway=path`, not a coastal feature. The peninsula polygon centroid at 8.1786, -82.9043 is a landmass centre, not a break | Rejected. No break-level coordinate found |
| Playa Duartes | none | Not in OSM, not in any surf guide, not in Spanish sources | Rejected. See the Duartes section |
| Playa El Estero, Santa Catalina | none | Not a mapped feature in OSM. It is the beach inside Santa Catalina town, so the town coordinate is within about 1 km, but I will not publish a number I did not check | Held back. Real spot, no coordinate |

### Coordinates in research file 10 that this file contradicts

Research file 10 marked most of its coordinates `(approx.)` and said so honestly. These are the
ones that were far enough off to matter. Nothing here is a criticism of that file; it flagged
them itself.

| Spot | Research file 10 | This file | Gap |
|---|---|---|---|
| Playa Venao | 7.45N, 80.06W (no approx marker) | 7.4321N, 80.1929W | 15 km. The old number is on the Destiladeros stretch |
| Playa Morrillo | ~7.65N, 81.15W | 7.4905N, 80.9534W | 28 km. It also carried a north-northeast offshore-wind inference that is wrong for a west-facing coast |
| Santa Catalina | ~7.62N, 81.13W | 7.6342N, 81.2546W | 14 km |
| Rio Mar | ~8.58N, 79.89W | 8.4562N, 79.9692W | 16 km |
| Playa El Palmar | ~8.62N, 79.98W | 8.4674N, 79.9544W | 17 km |
| Punta Chame | 8.62N, 79.77W | 8.6464N, 79.7066W | 8 km |
| Playa Caracol | ~8.60N, 79.87W | 8.5763N, 79.7896W | 9 km |

---

## Break orientation: sourced words versus derived degrees

This is the honest state of the single most load-bearing parameter after the coordinate.

**No source anywhere states a shore normal in degrees.** Not one. The best any of them do is
name an ideal offshore wind direction as a compass word. So every `theta_n_deg` in the seed file
is derived by me, and I have kept the sourced half and the derived half in separate fields.

Two derivation methods were used, and where both were available they were checked against each
other.

1. **From the sourced offshore wind.** Offshore wind by definition blows from the land toward
   the sea, so `theta_n = offshore_wind_from - 180`. This is a definition applied to a sourced
   value, not a guess. It is the method used for 15 of the 23 rows.
2. **From the coastline trend between two verified coordinates.** Take the bearing between two
   mapped points on the same stretch, rotate 90 degrees toward the sea. Used where no offshore
   wind is stated.

Where both methods were available they agreed. Method 2 in this table uses **only** OSM beach
nodes, so the two methods share no input.

| Coast stretch | Method 1, from sourced offshore wind | Method 2, from OSM node geometry | Gap |
|---|---|---|---|
| Coronado / San Carlos corridor | 135, from NW offshore wind | 145. Malibu (8.5577, -79.8445) to Farallón (8.3498, -80.1493) runs 235/055 | 10 deg |
| Mariato Sunset Coast | 247.5, from ENE offshore wind at Mariatos | 251.4. Reina (7.6209, -80.9972) to Morrillo (7.4905, -80.9534) runs 161/341 | 4 deg |
| Playa Venao | 157.5, from NNW offshore wind | 158.2. Mean of the Guánico-to-Venao segment (normal 145) and the Venao-to-Destiladeros segment (normal 172) | 1 deg |
| Cambutal and Guánico | 180, from N offshore wind | 163. Cambutal (7.2509, -80.4934) to Guánico (7.2733, -80.4186) runs 73/253 | 17 deg |

That is the strongest evidence in this file that the orientation numbers are not made up. Two
unrelated methods, one from a surf guide's wind field and one from map geometry, land within
17 degrees on four separate stretches of coast, and within 10 on three of them.

The Venao row matters most. surf-forecast.com has Venao's coordinate 14.6 km wrong, so their
wind field for that break could have been computed at the wrong place. It was not. Their implied
normal of 157.5 and the OSM node geometry at the true site agree to within one degree. The
descriptive "south-facing bay" wording, which would give 180, is the outlier of the three and I
did not use it.

**The single biggest orientation finding:** the Mariato stretch in Veraguas, which includes
Morrillo, Torío, Reina and the Mariatos break, **faces west, not south.** Its offshore wind comes
from the east-northeast, not the north. That is the opposite of the Bay of Panama pattern that
research file 10 inferred for Morrillo.

Three separate things confirm it, and no two of them share an input.

1. The bearing between the OSM beach nodes for Playa Reina and Playa Morrillo is 161 degrees, so
   the coast there runs north-northwest to south-southeast and its seaward normal is 251. Neither
   node comes from a surf source.
2. surf-forecast.com gives east-northeast as the offshore wind for the Mariatos break on that
   same stretch, which implies a normal of 247.5. That is a surf source and a different
   coordinate.
3. The stretch is marketed locally and by hotels on it as Panama's Sunset Coast. That name only
   works if the sun sets over its water.

Consequence for the scoring engine: with `sigma_dir` at 20 degrees, a spot whose `theta_n` is
wrong by 90 degrees will score near zero on days it is actually firing and near one on days it
is flat. Applying the Bay of Panama pattern to the Sunset Coast would have done exactly that.

**What this means for `S_dir` in practice.** Every `theta_n_deg` carries an uncertainty of 20 to
35 degrees, and `sigma_dir` is 20 degrees. So the orientation uncertainty is roughly the same
size as the gate width. Two suggestions for the design lane, neither of which is my call to make:

- The learned-correction layer should be allowed to move `theta_n` per spot, not just the score
  offset. Orientation is the parameter most likely to be wrong at seed time and it is directly
  checkable against reports.
- Until the correction has data, the confidence flag on any spot whose `theta_n_uncertainty_deg`
  is 30 or more should not be able to read high.

---

## The three known problems

### 1. Playa Duartes

**Still not found under that name.** Searched again, in English and Spanish.

| What I searched | Result |
|---|---|
| OpenStreetMap, `Playa Duartes`, country Panama | Empty. Zero features |
| OpenStreetMap, `Duarte`, country Panama | Four features. Río Duarte and Punta Duarte Garden Inn, both in Mariato, Veraguas. A restaurant at the same hotel. A convenience shop in San Félix, Chiriquí |
| Web, `"Playa Duartes" Panamá surf` | No match. Results returned other Panama spots only |
| Web, Spanish, `"playa Duarte" Panamá Veraguas olas surfear` | No match. The Spanish-language results name Punta Santa Catalina, Playa Morrillo and Playa Estero instead |
| es.tourismpanama.com Veraguas surf beaches page, official tourism board | Names five Veraguas surf beaches. Duarte is not one of them |

**The strong candidate, offered as a question not an answer.**

There is a real coastal place called **Punta Duarte** in Mariato district, Veraguas. It is at
about **7.5008N, 80.9721W**, in the hamlet of La Barra. The Punta Duarte Garden Inn describes
itself as a beachfront hotel with a private beach, gives its address as "Punta Duarte, Morillo,
Veraguas, Panama," and states it is 5 km past Torío. The straight-line distance from the mapped
Playa Torío beach node to that hotel is 5.8 km, which matches. It sits about 2.3 km from Playa
Morrillo. A surf-camp listing describes Punta Duarte as sitting in the middle of the Sunset
Coast with great surfing beaches and secluded coves.

So the pieces line up. There is a Punta Duarte, it is on the water, it is on a surf coast, and
it is right next to a break the tourism board names.

**I am not putting it in the seed file.** Nothing I found calls it Playa Duartes, and nothing
calls it a named break. A hotel having a private beach is not a surf spot. Guessing here is
exactly what `HANDOFF.md` section 7 says not to do. The exact questions for the cousin are in
the human-check section.

### 2. Playa Serena's contradictory season

**Both sources found and named. The tie breaks cleanly, and the two claims are not actually
measuring the same thing.**

| Source | Claim | What it is |
|---|---|---|
| surf-forecast.com/breaks/Playa-Serena, accessed 2026-08-08 | "The best time of year for surfing Playa Serena with consistent clean waves ... is during Winter and most often the month of January" | An automated label, computed from their own day-count statistic |
| A user review on that same surf-forecast.com page, accessed 2026-08-08 | "between November and April, it will be highly unlikely to find good surf at Serena. From May to October you need low, low tides and little wind with a strong swell to find great surf here" | A descriptive account from someone who surfs it |
| casa-swell-coronado.com/surfinginpanama, accessed 2026-08-08 | "The best time to come and try this wave is from April to November" | A surf house located at Playa Serena |

**Ruling: the April-to-November window is right, and the January label is not a season claim at
all.** Three reasons, in order of strength.

1. **surf-forecast contradicts itself on its own page.** The same page that labels January the
   best month also reports, for January at Playa Serena: clean surfable waves **0 percent** of
   the time, blown out **0 percent** of the time, too small **100 percent** of the time. A month
   with zero rideable days cannot be the best month for surfing. The label is picking the month
   with the least blown-out wind, which degenerates into nonsense when there is no swell to blow
   out.
2. **Two independent sources agree against it.** The user review and the casa-swell surf house
   are different authors, different sites, different interests. Both put the season in roughly
   April or May through October or November.
3. **It matches the physics already established.** Research file 10 section 2 documents Southern
   Hemisphere groundswell arriving on Panama's Pacific coast April through October, cited to
   more than one source. December through April is the dry, small, gap-wind season.

**The interesting part: the two claims were never really in conflict.** One is counting clean
days, the other is describing when there are waves. Separate the statistics and both are true at
once. January genuinely has the cleanest wind at Serena. It also has no surf. See problem 3.

### 3. Clean days versus swell size, and the app must not copy the conflation

Research file 10 flagged this. I can now put numbers on it, and it is worse than a wording
problem. It is an automated label that is flatly wrong for a whole cluster of spots.

surf-forecast.com's "best month" is computed from its percentage-of-clean-days statistic. Here
is what that statistic actually says for January at each spot, pulled from each spot's own page
on 2026-08-08.

| Spot | surf-forecast "best month" | Clean days that month | Blown out | Too small |
|---|---|---|---|---|
| Playa Serena | January | **0%** | 0% | **100%** |
| Playa Teta | January | **0%** | 0% | **100%** |
| Playa Malibu | January | **0%** | 0% | **100%** |
| Rio Mar | January | **0%** | 0% | **100%** |
| El Palmer | January | **0%** | 0% | **100%** |
| Hawaiisito | January | **0%** | not stated | **100%** |
| San Carlos Point | January | **0%** | not stated | **100%** |
| Playa Santa Catalina | January | 78% | 17% | - |
| Punta Brava | January | 78% | 17% | - |
| Playa Guánico | January | 81% | - | - |
| Playa Cambutal | January | 81% | - | - |
| Playa Venao | December | 86% | - | - |
| Playa Los Destiladeros | **July** | 82% | - | - |
| Mariatos | **April** | 41% | - | - |

Read the top block. Seven Bay of Panama spots are labelled "best month January" while their own
data says there is nothing rideable in January at all. The label is not measuring surf quality.
It is measuring the absence of onshore wind, and when the swell is zero that measure returns the
answer it always returns.

Read the bottom two rows. Destiladeros picks July and Mariatos picks April. Those are inside the
real Southern Hemisphere swell season. Those two are not errors and should not be "corrected" to
match their neighbours. They are a genuine coastline difference: Destiladeros is around the
corner from Punta Mala on a more exposed stretch, and Mariatos faces west.

**Rules this implies for the app.**

1. Never carry a "best season" or "best month" field copied from a source. Compute your own, and
   label which statistic it is.
2. If a season label ships, ship two, not one. Something like "biggest swell: May to October" and
   "cleanest wind: December to April". They are different questions and Panama's answer is
   genuinely different for each.
3. Nothing in this seed file carries a season field. That is deliberate. The one place it would
   have come from is poisoned.
4. The same trap applies to consistency ratings and star ratings on those sites, which are built
   from the same day-count. Do not import them either.

---

## Needs a human check

Concrete questions for the cousin. Each one is answerable in a sentence.

**On Playa Duartes**

1. Is Playa Duartes the beach at **Punta Duarte, in La Barra, Mariato, Veraguas**, at about
   **7.5008N, 80.9721W**, which is the beach next to the Punta Duarte Garden Inn and about 2.3 km
   from Playa Morrillo? That is the only Duarte on any Panamanian coast in OpenStreetMap.
2. If yes, is it a break in its own right or is it the same water people call **Playa Morrillo**?
   If it is the same water, it should be an alternate name on the Morrillo row, not a separate
   spot.
3. If no, is Duartes on the Pacific side at all, and roughly how far and in which direction from
   a beach we do have: Morrillo, Venao, Santa Catalina or Coronado?
4. Is Duartes a spot that gets talked about openly in the 500-person group, or is it one people
   keep quiet? Decision 16 says no secret break ever goes in, so if it is the second kind the
   answer is that it stays out regardless of where it is.

**On orientation, which is the parameter most likely to be wrong**

5. **Playa Caracol at La Boca de Chame: which way does the beach face?** One source says south
   wind is offshore there, which would make it a north-facing beach and would flip the entire
   regional pattern. If that is right it barely gets Pacific swell. This row cannot be scored
   until someone answers, so it is either settled or held out of launch.
6. **Playa El Toro at Pedasí: does it face east into the Gulf of Panama?** Everything around it
   faces south or southeast. If El Toro really is east-facing it needs a completely different
   swell window, and if it is not, my number is 60 degrees wrong.
7. **Punta Chame: where exactly is the wave, and which side of the spit is it on?** The only
   coordinate I have is the village centre. The kite lagoon and the wave are different water.

**On the Sunset Coast in Veraguas**

8. Morrillo, Torío, Reina and Punta Duarte all face west, not south, so the offshore wind there
   is easterly. Does that match what people actually see? This is the one regional claim in the
   file that reverses what research file 10 assumed.
9. Is **Playa Mariatos** a name locals use, and is it the same as Playa Quebro or Playa Malena?
   surf-forecast files it under Pedasí, which is 240 km away and clearly wrong.

**On spot names and identity**

10. At Las Lajas in Chiriquí, is the surf at **Playa Jobo**, which is the mapped beach, or at a
    different beach in the same locality?
11. **Playa El Estero** at Santa Catalina is named by the Panama tourism board but is not mapped
    anywhere. Is it the beach in front of Santa Catalina town, and is it a separate spot from
    La Punta or the same wave on a smaller day?
12. **Morro Negrito** in Chiriquí is documented as being on islands offshore. Which island, and
    is it reachable enough to belong in a ranked list a surfer acts on at 5:40am?

**On scope**

13. Are any of the 23 spots in the list ones the community would rather were not on a public
    ranked list? Decision 16 is a community-trust rule and one person saying so is enough to pull
    a row.

---

## What I could not verify

**Coordinates**

- **Morro Negrito.** The only citable coordinate, from surf-forecast.com, lands on an inland
  isolated dwelling called Mono Negrito in Tolé district. OpenStreetMap has no feature under
  Morro Negrito in Panama at all. Sources agree the camp is on islands off the Chiriquí coast
  but none of them give a number. Not published.
- **Punta Burica.** OpenStreetMap has a peninsula polygon and a footpath, neither of which is a
  break. No surf guide gives coordinates. Not published.
- **Playa El Estero, Santa Catalina.** Named by the Panama tourism board in Spanish. Not mapped
  in OpenStreetMap. Not published.
- **Playa Duartes.** Covered above.
- **Isla Coiba breaks.** Research file 10 already recorded stormrider.surf blocking automated
  fetches with a 403. I did not retry. Boat access only, so it is a poor fit for a ranked morning
  list anyway.
- **A second coordinate for Playa Morrillo and Playa Reina.** Both are marked `verified` on the
  strength of an OSM beach node on the correct coastline plus a separate source confirming the
  spot is real and well known. Neither has a second independent coordinate, because no surf guide
  I could reach carries either break with a lat/lon. They are the two weakest rows in the
  verified tier and they should be the first two a human eyeballs on a map.
- **Whether the Mariatos coordinate is on land or in the water.** The reverse geocode on
  7.41, -80.94 returned only the Veraguas administrative boundary with no feature, which neither
  confirms nor refutes it. Nothing else in the file depends on that coordinate: the west-facing
  Sunset Coast finding now rests on OSM node geometry that does not use it.

**Parameters**

- **Break orientation in degrees for every single spot.** No source states one. All 23 are
  derived. This is the largest single gap in the file.
- **Optimal swell size.** Only Playa Cambutal has a sourced range, 0.8 to 3.0 m, from research
  file 10. Every other spot has nothing, so `H_ref` in the scoring function has no seed value
  from this research. I left the field out rather than invent 22 numbers.
- **Tide preference** is missing for 10 of 23 spots. Where it exists it is a word, not a height,
  and the Gulf of Panama's spring range is close to 7 m, so "low tide" covers several metres of
  water. `eta_opt` and `sigma_tide` cannot be seeded numerically from anything I found.
- **Swell direction windows.** Sources give a single ideal direction, never a window. Every
  `swell_window_deg` is derived by widening the sourced ideal, and the widths I chose (30 degrees
  for points and reefs, 45 for beaches and sandbars) are conventions, not findings.
- **Crowd levels.** Only Playa Serena has a sourced crowd claim (most crowded in the Bay of
  Panama) and Cambutal has one the other way (rarely crowded). The rest are guesses I marked
  `unknown` rather than fill in.
- **Localism.** I did not find a single source framing any Panama Pacific spot as a secret or
  locals-only break. So no spot was excluded on that ground, and I want to be plain about that
  rather than claim I applied a rule I never got to use. Spots left out of the list were left out
  for thin sourcing or unverifiable coordinates. Question 13 above puts the localism call where
  it belongs, with a human who is in the group.

**Pacific breaks on surf-forecast.com I left out and why**

surf-forecast indexes 43 Panama breaks. After removing the 12 Caribbean ones and the 23 above,
these are the Pacific breaks I did not include: Corto Circuito, Modrono, Nuevo Loco, Panama La
Vieja, Quatro-Once (411), Esmeralda, Rinconsito, La Zurda, Rocky Point, Lagart Point, Playa
Mojon, Las Bovedas, Stanleys, Silva Island-P Land, Silva Island-Nestles, Morro Negrito
Rivermouth. Reason in every case is the same: a single unverified coordinate at two decimals and
no second source anywhere. Several of them (Stanleys, Rocky Point, Esmeralda) are named by the
Panama tourism board so they are clearly well known, and they are good candidates for a second
pass. Panama La Vieja and Las Bovedas are inside Panama City, which is a different question
entirely and probably not what someone driving two hours at 5:40am wants ranked.

---

## Not in launch scope

Caribbean coast. Decision 15 makes it a second launch. Recorded here so the work is not repeated.

surf-forecast.com indexes 12 Caribbean Panama breaks: Bluff, Dumpers, Paunch Reef, Careneros
Point Break, First Beach (Wizard Beach), Silverbacks (all Bocas del Toro), and Cuango, Maria
Chiquita, Playon, Isla Grande, Palenque, V-Land (Colón province).

Two things from research file 10 that a Caribbean launch must carry over, because they are not
cosmetic differences:

1. **Periods are 8 to 10 seconds, not 15 to 16.** The Pacific gets transoceanic groundswell. The
   Caribbean mostly gets short-fetch windswell. `H_eff = H·sqrt(T/10)` behaves very differently
   across that gap and a shared `H_ref` will be wrong on one coast or the other.
2. **The tidal range is under 1 m instead of nearly 7 m.** Tide should carry almost no weight in
   a Caribbean score and heavy weight in a Gulf of Panama one. Research file 10 makes the case
   that tide sensitivity should scale with each coast's actual range rather than being a global
   constant. That is a schema question worth settling before the second launch, not after.

Also out of scope and worth naming: the **Punta Chame kite lagoon** is flat water on the bay side
of the spit. It is not a wave break and must not be seeded as a spot in a surf ranking. Only the
ocean side belongs.

---

## Sources log

All accessed 2026-08-08.

Mapping

- https://nominatim.openstreetmap.org/search
  Forward geocode, `countrycodes=pa`, used for every OSM coordinate in this file.
  Data (c) OpenStreetMap contributors, ODbL 1.0
- https://nominatim.openstreetmap.org/reverse
  Reverse geocode, used for the coastline sanity checks that caught Morro Negrito and the
  Playa Venao conflict

Surf guides

- https://www.surf-forecast.com/countries/Panama/breaks (the full 43-break Panama index)
- https://www.surf-forecast.com/breaks/Playa-Venao
- https://www.surf-forecast.com/breaks/Cambutal
- https://www.surf-forecast.com/breaks/Playa-Serena
- https://www.surf-forecast.com/breaks/Playa-Teta
- https://www.surf-forecast.com/breaks/Playa-Malibu_2
- https://www.surf-forecast.com/breaks/Rio-Mar
- https://www.surf-forecast.com/breaks/El-Palmer
- https://www.surf-forecast.com/breaks/San-Carlos-Point
- https://www.surf-forecast.com/breaks/Hawaiisito
- https://www.surf-forecast.com/breaks/Playa-Santa-Catalina
- https://www.surf-forecast.com/breaks/Punta-Brava
- https://www.surf-forecast.com/breaks/Playa-Guanico
- https://www.surf-forecast.com/breaks/Destiladeros
- https://www.surf-forecast.com/breaks/Mariatos
- https://www.surf-forecast.com/breaks/Morro-Negrito (coordinate rejected, see above)
- https://deepswell.com/surf-guide/Central-America/Panama/Playa-Serena/1751
- https://www.casa-swell-coronado.com/surfinginpanama/

Official and local

- https://es.tourismpanama.com/blog/post/playas-de-surf-en-la-costa-pacfica-de-veraguas/
  Panama tourism board, Spanish. Names five Veraguas surf beaches
- https://www.tourismpanama.com/places-to-visit/pacific-riviera/things-to-do/watersports-and-beaches/surf/
  Panama tourism board, English. Names the Coronado corridor spots
- https://puntaduarte.com/location/
  Punta Duarte Garden Inn. Road distances that pin the Torío to Punta Duarte to Morrillo sequence
- https://www.booksurfcamps.com/hotel-el-sol-morrillo/surf-hotel-el-sol-morillo-in-punta-duarte-panama
  Punta Duarte described as the middle of the Sunset Coast
- https://morronegrito.travel/
  Morro Negrito camp. Island location, no coordinates

Prior work in this repo

- `docs/research/raw/10-panama-surf-spots-domain.md`
  Physics, climatology, gap winds, tidal asymmetry, and the source list this file builds on
- `docs/research/raw/09-ai-forecast-methodology.md` section 7
  The scoring maths these fields feed
- `docs/DISCUSS-decisions.md` 15 and 16
  Scope
