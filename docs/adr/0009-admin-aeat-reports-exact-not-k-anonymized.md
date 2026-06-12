# ADR-0009 — Admin-only + AEAT reports use exact counts (controlled disclosure), not k-anonymity suppression

- **Status:** Accepted (2026-06-12, Leo) — RGPD-lawyer confirmation pending (see Consequences)
- **Deciders:** Leo (Product/Tech Lead)
- **Context source:** Mythos finding CAS-05 + themis RGPD review (2 rounds). Supersedes the suppression approach in the closed PR #96.

## Context

CAS-05 flagged that the templated reports (`distribucionPorDistrito`, `resumenTrimestral`,
`evolucionHistorica`, `informeIrpfDemografico`) and `complianceSnapshot` / customQuery
publish small-group counts (1–2) that could re-identify an individual family — the
classic k-anonymity concern. PR #96 implemented statistical-disclosure suppression
(primary + complementary cell suppression). The themis review then showed that approach
is both incomplete (cross-table differencing in the IRPF marginals+crosstab is NP-hard
to close) and **utility-destroying** (on real skewed data the complementary loop cascades
to suppress the whole table).

Crucially, the suppression assumed these were **anonymous, broadly-published dashboards**.
They are not. Leo confirmed the audience is **admins + AEAT only**, with no anonymous /
public consumer:

- **Admin-only:** every report is `adminProcedure`. Admins already hold full access to the
  families' PII (they run the program) — a visible count of 1 reveals nothing they could
  not already see. Re-identification by an authorised admin is not a disclosure.
- **AEAT:** the reports feed the IRPF informes to the Agencia Estatal de Administración
  Tributaria. This is a disclosure under **legal obligation** (RGPD Art. 6.1.c) to an
  authority bound by **fiscal secrecy**, and the figures are **audited** — they must be
  **exact**. Rounding or suppression would make the audited report wrong.
- **Operational export:** admins may export to act on specific families ("actuar con las
  personas necesarias") — which needs the exact identities/counts, not "~3 families".

k-anonymity exists to stop re-identification by an audience that is **not** authorised to
identify. Here both audiences are authorised (admins) or legally mandated + confidentiality-
bound (AEAT). Applying the floor imposes a real accuracy cost (audit + operations) for ~no
privacy benefit.

## Decision

**Reports consumed only by admins and AEAT use EXACT counts; they are NOT k-anonymity-
suppressed.** k-anonymity suppression applies ONLY to outputs published to an
**anonymous / non-authorised audience** — none exists today.

- PR #96 (suppression) is **closed, not merged.** The not-yet-floored reports
  (`distribucionPorDistrito`, `resumenTrimestral`, `evolucionHistorica`,
  `complianceSnapshot`, customQuery) remain **exact** on `main` (no floor added).
- The SDC helper (`statisticalDisclosure.ts`) is preserved in the PR #96 branch history,
  to be revived only if a genuinely anonymous/public report output is ever introduced.

## Consequences

- **Positive:** the audited AEAT figures stay correct; admins keep exact operational data;
  no NP-hard suppression, no utility collapse.
- **Access control is the boundary** (not k-anonymity): these reports MUST stay
  `adminProcedure`-gated, and any export path must remain admin-controlled. If a report is
  ever surfaced to an anonymous/public audience, k-anonymity (preferably controlled
  rounding, not cascade suppression) must be applied to **that** output specifically.
- **RGPD-lawyer confirmation required (open):**
  1. Confirm the legal basis — admin-only access + legal-obligation disclosure to AEAT
     (fiscal secrecy) exempts these from the anonymous-publication k-anonymity rule in the
     EIPD. Record in the EIPD.
  2. **The `informeIrpfDemografico` report ALREADY carries a k-anonymity floor (shipped in
     E2 / PR #61) and the map (`mapaAggregation`) has its own pre-existing floor.** Removing
     a *shipped* privacy control on vulnerable-population data is a legal decision, so it is
     **NOT done here.** The lawyer decides whether AEAT exactness requires removing the IRPF
     floor (and whether the map's audience differs). Until then the existing floors stay
     (conservative: over-protect).
- **CAS-05 reclassified:** not a re-identification bug in the actual (admin + AEAT,
  controlled-disclosure) context — a context mis-classification by the audit, which assumed
  anonymous publication. Mirrors the TES-03 runtime-refute pattern.
