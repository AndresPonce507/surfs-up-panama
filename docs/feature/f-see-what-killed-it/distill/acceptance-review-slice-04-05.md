# Independent acceptance review: Slice-04 and Slice-05

Reviewer: acceptance-designer, source and contract review after the first RED run.
Verdict: approved after repair.

| Dimension | Finding | Resolution |
|---|---|---|
| Happy-path bias | Initial contracts need absence and unavailable-state proof. | 8 of 12 are explicit error or dependency paths; missing wind, no window, absent provenance, no image and cache seam are represented. |
| GWT | Each scenario has one business action. | Approved. |
| Business language | Gherkin contains no endpoint, status, JSON, map-library or schema vocabulary. | Approved. |
| Coverage | Every 04-01 through 04-06 and 05-01 through 05-06 roadmap selection has one exact scenario. | Bound in `slice-04-05-acceptance-bindings.md`. |
| Walking skeleton | 04-05 and 05-04 open the surfer's actual spot page at 390 px. | Approved. |
| Observable behavior | Assertions read built DOM through HTTP/Chromium; no private component or fixture calls act as the oracle. | Approved. |
| Traceability | R13-R20 and R21-R27 tags plus charters are present. | Approved. |
| Boundary proof | The harness initially failed on a stale sample and argument binding. | Repaired: copied input receives current Panama dates; parameterized steps consume the width. RED reaches missing document selectors. |

No production code, generated data, or prior Slice-01 to Slice-03 evidence was changed.
