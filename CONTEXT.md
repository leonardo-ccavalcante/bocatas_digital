# CONTEXT — Bocatas Digital

The domain glossary and ubiquitous language for this project. When skills or agents name a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term **as defined here**. Don't drift to synonyms.

If a concept you need isn't here yet, that's a signal: either you're inventing language the project doesn't use (reconsider), or there's a real gap (note it, then add it via `/grill-with-docs`).

> Scope note: this file is the *domain* source of truth. Stack, agent orchestration, gates, and guard rails live in `CLAUDE.md`. Architectural decisions live in `docs/adr/`.

---

## The mission, in one sentence

Replace 6 fragmented systems (Notion, Excel, cardboard punch, Google Sheets, GUF, text notes) with one digital platform for **Asociación Bocatas**, serving 4,000+ vulnerable people/year in Madrid.

**North Star:** personas registradas con al menos 1 check-in digital en los últimos 30 días.

---

## Ubiquitous language (glossary)

Spanish is the operational language of the domain. UI chrome is Spanish-only (the consent modal is the sole exception). Use the Spanish term as the canonical name; the English gloss is for disambiguation only.

| Term | Definition | Avoid (synonym drift) |
|------|------------|-----------------------|
| **Persona** | An individual beneficiary served by Bocatas. The core entity. Has an internal UUID, a profile, and optionally a QR card. Follows Open Referral HSDS field naming where applicable. | "beneficiario" in code/UI labels (institutional); "usuario" |
| **Beneficiario** | RBAC *role* for a persona who logs into the future PWA. Not a synonym for "persona" in prose — it's a role. | using interchangeably with "persona" |
| **Voluntario** | RBAC role: front-line volunteer who runs check-in and registration. | "operator", "staff" |
| **Check-in** | The act of recording a persona's attendance at a service point. Replaces the cardboard punch card. Target: < 8s end-to-end. The only flow modelled with an XState machine. | "attendance scan", "fichaje" |
| **Punch card / cardboard punch** | The legacy paper attendance method being replaced. AS-IS baseline (~30s). | — |
| **Service point / comedor** | A physical location where a service (e.g. meals) is delivered and check-ins happen. | "site", "venue" |
| **Tarjeta de miembro** | The QR card issued to a persona. Carries an internal UUID **only** — never PII. | "tarjeta de beneficiario", "registration card", "ID card" |
| **Fase de itinerario** | A persona's stage in the social-inclusion journey. ENUM 0–4: 0=Acogida, 1=Estabilización, 2=Formación, 3=Inserción Laboral, 4=Autonomía. Required field. | "status", "stage" (use the Spanish phase names) |
| **Familia** | A household unit in the Programa de Familia (Gate 2). Has `family_members`, documents, deliveries. Sourced from GUF data, stored locally. | "household" in code identifiers (keep `families`) |
| **Programa de Familia** | The Gate 2 program serving households; coordinated by Sole. Includes GUF CSV sync, deliveries, compliance cards CM-1..CM-5. | "families module" in user-facing text |
| **GUF** | Banco de Alimentos system. **No API.** Data flows in/out via CSV only. Deletions in GUF are non-recoverable — never treat GUF as source of truth; store locally. | treating GUF as authoritative; "GUF API" |
| **Delivery / entrega** | A recorded physical handover (e.g. food) to a familia, with a signature scaffold for Banco de Alimentos subsidy verification. | "shipment" |
| **Reparto** | A delivery cycle for the Programa de Familia: a named `delivery_round` over chosen (non-consecutive, ≤10/month) days, each split into turnos. Replaces the consecutive-day model. See ADR-0010. | "delivery round" in user-facing text |
| **Slot** | The scheduling unit of a reparto = `(día, turno)`. A family is assigned to exactly one slot; re-assign = move. | conflating slot with día |
| **Turno** | A delivery shift within a día: `manana` or `tarde`. A día may run one or both. | "shift" in code identifiers (keep `turno`) |
| **Cerrar turno / cerrar reparto** | Closing a turno marks its pendientes as no-show; the reparto is complete only when every slot is closed. | closing a round without closing its turnos |
| **Hoja de Firmas** | The per-turno signing sheet (funder inspection evidence): printed, wet-signed by each familia, the photo re-uploaded and stored on the slot. | "signature sheet" (keep Hoja de Firmas) |
| **Consent / consentimiento** | A persona's recorded RGPD consent. Multi-language by population threshold. Rendered in the consent modal — the only place non-Spanish text appears. | "agreement", "T&Cs" |
| **Consent language** | The 4 template languages (es, ar, fr, bm) — distinct from **idioma** (9 person-language values). A new template language is added when ≥5 active personas have that `idioma_principal`. | conflating `consent_language` with `idioma` |
| **Idioma principal** | A persona's primary language (ENUM of 9: es, ar, fr, bm, en, ro, zh, wo, other). Drives which consent template is shown; Spanish + verbal-translation banner is the fallback. | — |
| **EIPD** | Evaluación de Impacto en Protección de Datos. The DPIA / legal shield. Must exist before any data collection. | "privacy policy" |
| **High-risk fields** | `situacion_legal`, `foto_documento_url`, `recorrido_migratorio`. Read access restricted to superadmin/admin. | — |
| **Redaction boundary** | `redactHighRiskFields` — the single application-layer PII wall. DB-level RLS is bypassed app-wide; redaction is what enforces field-level access. See ADR-0002. | assuming DB RLS protects PII |
| **Announcements / novedades** | Out-of-original-spec but retained feature: audiences DSL, bulk import, n8n webhook + retry log. | — |
| **Chatwoot** | External (VPS) omnichannel messaging (WhatsApp + email). Bocatas Digital emits events; Chatwoot/n8n deliver. No messaging SDK in the app server. | "our WhatsApp integration" |
| **n8n** | External (VPS) workflow automation that turns app webhook events into messages/actions. Retries tracked in `*_webhook_log`. | — |
| **OCR / extract-document** | Supabase Edge Function for document extraction; feeds the uploads-tab archive, scoped per `programa_id`. | — |
| **HSDS** | Open Referral Human Services Data Specification. Persona/service records follow HSDS field naming for future NGO interoperability. | inventing ad-hoc field names |

---

## RBAC roles

Four roles: **superadmin**, **admin**, **voluntario**, **beneficiario**. High-risk fields are readable only by superadmin/admin.

---

## Bounded contexts (informal)

Single-product, single-tree (`repo/` = Vite client + Express server). Feature modules, each with `client/src/features/{name}/` and `server/routers/{name}/`:

- **persons** — registration, duplicate detection, profile 360°, QR.
- **checkin** — QR scan, XState FSM, visual feedback, manual fallback, offline.
- **dashboard** — KPI cards, trend, Realtime counters, CSV export.
- **programs** — enrollment.
- **auth** — RBAC, session.
- **families** — Programa de Familia, GUF sync, deliveries, compliance cards.
- **announcements** — audiences DSL, bulk import, webhook log.

Deferred (schema stubs only, do not pre-create folders): courses, volunteers, cases, grants, employment.

---

## Domain invariants

- **No PII in QR codes** — internal UUID only.
- **No PII in logs or error messages** — IDs only.
- **No duplicate same-day, same-service-point check-in** for a persona.
- **GUF is never the source of truth** — store its data locally; export CSV before any Go-Live migration.
- **Consent never silently renders Spanish** — if `idioma_principal` has no active template, show Spanish + a verbal-translation banner.
- **Manual fallback is first-class**, not an exception path — for both check-in ("Sin QR") and OCR.
- **Check-in result must be understood without reading text** — color + icon (green/amber/red).
