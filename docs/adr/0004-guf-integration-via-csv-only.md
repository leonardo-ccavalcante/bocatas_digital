# ADR-0004: GUF integration via CSV only (no API)

**Status:** Accepted

## Context

The Programa de Familia depends on data from GUF (Banco de Alimentos). GUF exposes **no API**. Its only integration surface is CSV export/import. Critically, deletions in GUF are non-recoverable *within GUF* — if a record is removed there, the data is gone unless captured beforehand.

## Decision

Integrate with GUF via **CSV upload/download only**. Store GUF-sourced data locally in the `families` table and treat the local store — never GUF — as the source of truth for the platform.

- Export a GUF CSV before any Go-Live migration or any action that could trigger GUF-side deactivations.
- Validate CSV field completeness against the schema (Gate 0 audit assumption #8) — missing fields produce incomplete family profiles.
- Do **not** build a GUF API integration; there is nothing to integrate against.

## Consequences

- No live sync — data is as fresh as the last CSV exchange. Acceptable for the program's cadence.
- Local store insulates the platform from GUF data loss.
- Import is a first-class, validated workflow (preview, field mapping), not a one-off script.
- Any future GUF API would be a new decision (supersede this ADR).
