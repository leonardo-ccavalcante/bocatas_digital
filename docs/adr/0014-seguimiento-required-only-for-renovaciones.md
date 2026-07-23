# ADR-0014 — The informe-social seguimiento gate applies only to renovaciones

Status: Accepted

## Context

The Informe de Valoración Social generation pipeline enforced "a seguimiento
(follow-up) less than `INFORME_EXPIRY_MONTHS` old must exist" for EVERY
generation, in three agreeing layers (client `SocialReportPanel` blocking
message, server `documentService.validateContext`, bulk
`informeEligibility.evaluateInformeReadiness`). That rule conflates two
different situations: a **renovación** (an informe already exists, and the new
one must be backed by a recent review) and the **first informe** of a family,
which by construction cannot have a follow-up of a prior informe. In practice a
newly registered family with a saved valoración was permanently blocked from
its first informe until an artificial seguimiento was created.

Product decision (Leo): the first informe must require only the saved
valoración; from the second informe onward the existing 6-month seguimiento
rule applies unchanged.

## Decision

1. **"A prior informe exists" is defined by a current REAL document row**, not
   by flags: a `family_member_documents` row with `member_index = -1`,
   `documento_tipo IN ('informe_valoracion_social' /* generated docx */,
   'informe_social' /* uploaded PDF */)`, `is_current = true`,
   `deleted_at IS NULL` and a non-null `documento_url`. The
   `families.informe_social` boolean and `informe_social_fecha` are NOT proof —
   the manual «Actualizar» flow can set them with no document behind them.
2. **The seguimiento gate (missing AND stale checks) runs only when a prior
   informe exists.** The first informe skips both — a stale seguimiento must
   not be worse than having none. The valoración requirement is unconditional.
3. The signal travels as a required `has_informe_previo` boolean on the informe
   context (`documentService.types.ts`) and on `InformeReadinessInput`, so the
   compiler forces every producer to decide it. Producers: the context builder
   (single generation) and `informeBulkData` (bulk), each with its own query.
4. **Fail-loud**: a DB error while checking for the prior informe throws; it is
   never silently treated as "no prior informe", because that would waive the
   legal gate on a renovación.

## Consequences

- A family whose only informe document is soft-deleted becomes a "first
  informe" family again. Accepted: the document row is the source of truth.
- The three layers must keep agreeing; each layer carries a test for the same
  first-informe scenario, and the invariant text lives in
  `shared/informeFreshness.ts` (concept A).
- `derivacion` shares the informe context block but is never seguimiento-gated;
  its builder path hardcodes `has_informe_previo: false` and runs no query.
- Bulk skip labels now read as renovación conditions ("Renovación sin
  seguimiento registrado", "Renovación con seguimiento vencido") so operators
  are not told a first-informe family lacks a seguimiento it never needed.
- **Boundary with the INFORME_AL_DIA bulk policy (deliberate):** the policy
  layer in `informeBulkData` keeps keying off `informe_social_fecha`. A family
  with ONLY the manual flag (recent fecha, no document row) is a "first
  informe" for the GATE (individual generation allowed) but is still skipped
  by BULK as "al día" — the recorded fecha is the operator's assertion that a
  recent informe exists outside the app (e.g. on paper), and mass-generating
  over it would produce duplicates. The gate answers "may we generate?";
  the policy answers "should bulk touch this family?". They intentionally
  use different signals.
