# EIPD — Addendum: PostHog Product Analytics + Session Replay (EU)

> **DRAFT for legal review — NOT legal advice.** Prepared by the engineering team to
> describe a new processing activity so the RGPD lawyer (with Leo) can validate,
> complete the risk/legal-basis sections, and sign. This is an **addendum** to the
> existing Bocatas Digital EIPD (Gate 0). **Session replay is heightened-risk
> processing.** Do **not** set `VITE_PUBLIC_POSTHOG_KEY` in production until this
> addendum is signed.

| Field | Value |
|---|---|
| Processing activity | Product analytics + **session replay** of STAFF web sessions (PostHog) |
| Status | Code complete; **DISABLED** (no prod key set). Lands inert. |
| Data controller | Asociación Bocatas |
| Processor | PostHog (EU Cloud — `eu.i.posthog.com`, data resident in the EU) |
| Owner of this addendum | Leo (Tech Lead) + RGPD lawyer |
| Base EIPD | Bocatas Digital EIPD (Gate 0) — this extends it |

## 1. Purpose of the processing
Understand how **staff** (admin / voluntario / superadmin) use the app, so we can
measure adoption (North Star: personas with ≥1 digital check-in/30d), find UX friction
on low-end Android, and reduce failed-QR / abandoned-registration rates. Two mechanisms:

1. **Explicit events** — a small, closed set of PII-free events (counts/enums only):
   `checkin_completed{method}`, `person_registered{}`, `document_uploaded{type}`.
   Autocapture is **OFF**.
2. **Session replay** — a masked recording of the rendered UI (rrweb) to see *how* a
   task was performed, without seeing *whose* data was on screen.

## 2. Data subjects
**Staff/volunteers of Asociación Bocatas only.** Beneficiaries never authenticate
(they are anonymous QR check-ins) and are **never identified** in PostHog. However,
staff screens *render* beneficiary PII — so the replay's masking (below) is the control
that prevents beneficiary data from being captured. Beneficiaries are therefore indirect
data subjects whose protection depends entirely on the masking configuration.

## 3. Data categories processed
- **Staff identity (minimal):** `distinct_id = String(user.id)` (a surrogate int, not the
  Manus openId) + a single property `{ role }`. **No staff name, email, or openId** is
  ever sent (`person_profiles: 'identified_only'`; identify is staff-only; `reset()` on
  logout).
- **Explicit event properties:** enums/counts only (`method ∈ {qr,manual,anonymous}`,
  document `type` category label). A runtime guard rejects any PII-shaped key/value.
- **Session replay (masked):** DOM structure + interaction (clicks, navigation, layout),
  with:
  - **All text masked** (`maskTextSelector: '*'`) — names, DNI/NIE, addresses become
    blocked blocks.
  - **All inputs masked** (`maskAllInputs: true`, every `maskInputOptions` type).
  - **All media/PII surfaces blocked** (`.ph-no-capture`): document/photo viewers,
    upload previews, QR images/canvas, camera video, ConsentModal, familia member-doc UI.
  - **No canvas, no cross-origin iframes.**
  - **No network request/response bodies or headers** (API payloads carry PII).
  - A `before_send` scrubber strips email/phone/DNI/NIE from any event property and
    sanitises URLs (drops query strings + id path segments) as defence-in-depth.

> ⚠️ **What is NOT captured:** beneficiary names, DNI/NIE, phone, email, document photos,
> `situacion_legal`, `recorrido_migratorio`, QR payloads, API bodies. The design intent is
> that a recording shows *interaction and layout* but never personal data.

## 4. Legal basis (to be confirmed by lawyer)
- **Art. 6 GDPR:** legitimate interest (product improvement) — staff are informed
  employees/volunteers; OR consent. Lawyer to set and to confirm staff are notified.
- Replay records the staff member's own session → a transparency/notice obligation to
  staff (not beneficiaries, since beneficiary data is masked out). Lawyer to confirm the
  staff notice and whether a DPA/SCCs with PostHog (EU) are required.

## 5. Recipients
- **Internal:** Bocatas admins with PostHog project access (to be enumerated + access-
  controlled in PostHog).
- **Processor:** PostHog EU Cloud. A **Data Processing Agreement** must be in place
  before activation. EU residency confirmed by `api_host = https://eu.i.posthog.com`.

## 6. Retention (to be set by lawyer + configured in PostHog)
- Session recordings: [proposed ≤ 30 days] — lawyer to confirm.
- Events: [proposed ≤ 12 months] — lawyer to confirm.
- Configure retention in the PostHog project settings before activation.

## 7. Data subject rights & opt-out
- **Do Not Track** is honoured (`respect_dnt: true`).
- A programmatic opt-out is exposed (`optOutCapturing()`) for a future settings toggle.
- Staff ARCO/erasure requests routed via the existing Bocatas data-rights channel;
  deletion executed in PostHog.

## 8. Activation gate (engineering)
- The integration is **inert** until `VITE_PUBLIC_POSTHOG_KEY` is set. With the key unset
  (the default, and CI), posthog-js is never loaded — it is dead-code-eliminated from the
  build (0 bytes). See `docs/integrations/posthog.md`.
- **Do not set the prod key until this addendum is signed.**
- Before flipping in prod: (a) verify masking on a real PII-bearing screen in staging,
  (b) confirm DPA + retention in PostHog, (c) confirm staff notice.

## 9. Open items for the lawyer
- [ ] Confirm legal basis (Art. 6) + staff transparency notice.
- [ ] Confirm DPA / SCCs with PostHog EU.
- [ ] Set retention windows.
- [ ] Confirm masking is sufficient mitigation for the beneficiary-PII-on-screen risk.
- [ ] Sign → only then provision the prod key into deployment secrets.
