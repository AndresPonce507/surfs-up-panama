# Tide station profiles

The shipped profile document is intentionally empty as of 2026-08-13. No
launch spot is assigned Balboa `9812501`, Cristobal `9817583`, or any other
station.

A future mapping must be marked `accepted` and carry its exact-spot audit
record: the named local reference with coordinates and time zone, at least 28
observed high/low events spanning 14 consecutive local days, p90 phase error
at or below 30 minutes, no phase error above 45 minutes, and every daily
observed/predicted range ratio in `[0.80, 1.20]`. Candidate or incomplete
records are rejected during production composition and cannot activate NOAA
CO-OPS requests.

The binding product policy is [ADR: Tide source](adr-tide-source-chain.md).
