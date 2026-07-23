# Architecture Decision Records

Each ADR captures one architectural decision: its context, the decision, and its consequences. ADRs are immutable once Accepted — to change a decision, write a new ADR that supersedes the old one (and update the old one's status).

Format: lightweight MADR. Status is one of `Proposed` / `Accepted` / `Superseded by ADR-NNNN` / `Deprecated`.

If your work contradicts an Accepted ADR, **surface it explicitly** rather than silently overriding (see `docs/agents/domain.md`).

> **Canonical location:** this directory — `repo/docs/adr/`, tracked in git. ADRs and `CONTEXT.md` live in the versioned tree so they travel with the code and are reviewed in PRs — **not** at the untracked workspace root. See the guardrail in `CLAUDE.md`.

| ADR | Title | Status |
|-----|-------|--------|
| [0001](0001-zod-single-source-of-validation-truth.md) | Zod is the single source of validation truth | Accepted |
| [0002](0002-pii-protection-via-application-layer-redaction.md) | PII protection via application-layer redaction | Accepted |
| [0003](0003-xstate-only-for-check-in.md) | XState only for the check-in flow | Accepted |
| [0004](0004-guf-integration-via-csv-only.md) | GUF integration via CSV only (no API) | Accepted |
| [0005](0005-messaging-via-chatwoot-n8n-not-app-server.md) | Messaging via Chatwoot + n8n, not the app server | Accepted |
| [0006](0006-consent-language-by-population-threshold.md) | Consent language set driven by population threshold | Accepted |
| [0007](0007-on-conflict-inference-index-strategy.md) | ON CONFLICT requires a non-partial, column-inferable unique index | Accepted |
| [0008](0008-gated-migrations-platform-readiness.md) | Legally-gated migrations apply for platform readiness; signoff is a go-live gate | Accepted |
| [0009](0009-admin-aeat-reports-exact-not-k-anonymized.md) | Admin-only + AEAT reports use exact counts, not k-anonymity | Accepted |
| [0010](0010-reparto-slot-model-dia-turno.md) | Reparto scheduling unit is a SLOT = (día, turno) | Accepted |
| 0011 | User-identity columns are TEXT (Manus OAuth), not UUID-FK to auth.users | Accepted (via #119) |
| [0012](0012-storage-proxy-authentication.md) | The storage proxy authenticates and authorizes every object request | Accepted |
| [0013](0013-program-tree-single-enrollment-table.md) | Program tree with a single enrollment table | Accepted |
| [0013b](0013-reparto-flexible-suggested-day-carryover.md) | Reparto flexible list: suggested day + carry-over | Accepted |
| [0014](0014-seguimiento-required-only-for-renovaciones.md) | Informe-social seguimiento gate applies only to renovaciones | Accepted |
| [0015](0015-session-lifecycle-magic-link-and-compliance.md) | Session lifecycle: materialized calendar, magic-link professor flow, compliance in the dashboard | Accepted |

> **Provenance.** 0001–0006 were reconstructed from `CLAUDE.md`/project history (decisions already shipped as of 2026-05-21), not authored at decision time. 0007–0010 arise from the Mythos audit (2026-06-11, `d3aff9e`) remediation + reparto (#112). 0011 is from #116/#119. 
>
> **Consolidation (#117, 2026-07-08).** 0001–0007 and 0012 previously lived **untracked at the workspace root** and were moved here. 0012 was a root draft numbered 0009 (renumbered to avoid colliding with the tracked 0009). An earlier root draft *"ADR-0008 — migrations outside the apply path"* was **superseded** by the tracked 0008 (migrations apply for platform readiness; Leo, 2026-06-12, verified vs prod) and is intentionally not carried over.
