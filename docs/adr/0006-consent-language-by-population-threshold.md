# ADR-0006: Consent language set driven by population threshold

**Status:** Accepted

## Context

Beneficiaries speak many languages (the `idioma` enum has 9 values: es, ar, fr, bm, en, ro, zh, wo, other). RGPD consent must be genuinely understood, so consent text cannot simply default to Spanish. But maintaining legally-reviewed consent templates in every possible language is impractical and most languages have very few speakers at any given time. UI chrome, separately, is Spanish-only — the consent modal is the one place non-Spanish text is rendered.

## Decision

Two distinct enums: `idioma` (9 person-language values) and `consent_language` (the template set). The **minimum** template set at all times is **es, ar, fr, bm**. An additional language is added to the template set when **≥5 active personas** have that `idioma_principal`.

Fallback rule (non-negotiable): if a persona's `idioma_principal` has no active consent template, the flow renders **Spanish + a banner instructing the volunteer to provide verbal translation**. It must **never silently render Spanish** as if it were understood.

## Consequences

- Template maintenance scales with the actual population, not the theoretical language space.
- The es/ar/fr/bm floor guarantees coverage for the largest groups at all times.
- The fallback keeps consent legally defensible for rare languages without a template.
- Adding a language is a data/threshold event, not a code change to the consent flow.
- Conflating `consent_language` with `idioma` is a bug — they are deliberately separate (see `CONTEXT.md`).
