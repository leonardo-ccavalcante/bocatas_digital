# ADR-0014 — Session lifecycle: materialized calendar, magic-link professor flow, and compliance in the dashboard

- **Status:** Accepted (2026-07-23, Leo) — validated on a live localhost before PR
- **Deciders:** Leo (Product/Tech Lead)
- **Context source:** Grill session over the 2026 stakeholder transcripts + the «cierre de sesión»
  UI copy Leo pasted; screen-level mockup approved before build; then hardened by three rounds of
  adversarial review (19 + 4 + 6 verified findings, all fixed) and live-verified on a seeded demo.
- **Builds on:** ADR-0013 (program tree + single enrollment table), ADR-0007 (ON CONFLICT arbiter
  must be a non-partial index), ADR-0002 (app-layer redaction is the only PII wall), ADR-0005
  (the app never sends messages directly — it emits events to n8n/Chatwoot), ADR-0012 (storage proxy).

## Context

Programs (ADR-0013) had no concept of a *session*: `program_sessions` was a one-shot "closed" row
with no lifecycle, the only close UI (`CerrarSesionPrograma.tsx`) was built but never rendered,
`programs.session_close_config` existed unwired (a static "contacta con el administrador" block),
attendance did not link to a session, and there was no schedule — so the funder-critical question
"did the teacher upload the plan for **all** the classes?" was unanswerable (no denominator). The
Notion workaround was manual per-month duplication.

## Decision

- **A session belongs to a tree node; attendance rolls up.** One check-in against a session is read
  three ways with no duplicate entry: presence at that class (absence list), presence in the edition
  (monthly list), and in the umbrella's funder numbers (subtree `COUNT(DISTINCT person_id)`).
- **The planned calendar is materialized.** `programs.config.programacion` (weekday + start/end time)
  generates `program_sessions` rows with `estado='planificada'` between the program's start/end
  dates. Lifecycle `planificada → abierta → cerrada | cancelada`; a `cancelada` session (with a
  motivo) leaves the compliance denominator. Materialization is idempotent (SELECT-existing →
  INSERT-missing on `(program_id, fecha)`, never `ON CONFLICT` against the partial-unique open-session
  index per ADR-0007; never deletes a session bearing attendance/data). Generated sessions are
  stamped with a `location_id` (from `config.location_id`, overridable at `abrirSesion`) so they can
  take attendance from creation — `abrirSesion` refuses to open a session with no resolvable location.
- **Hybrid professor model — obligation is on the session, authorship is stamped.** Three doors, one
  metric: (1) a scoped voluntario account limited to the node; (2) a per-session **magic link** —
  an opaque HMAC token (`shared/sessionEnlace.ts`), only its hash stored, expiry-bounded, revocable,
  usable on the phone with no login; (3) staff acting «en nombre de» the teacher. Every action is
  stamped; compliance measures **the session** ("plan 19/22"), never who typed. The magic link's
  public endpoints are token-gated (estado ∈ {planificada, abierta}), the *mint* is access-guarded
  (`assertProgramAccessForRole`, fail-closed), and the roster returns nombre+apellidos only — never a
  high-risk field, never a soft-deleted person (Art.17).
- **The generic cierre OWNS `session_close_config`.** Nothing runtime-parsed the old TASK6 shape
  (opaque `Json` everywhere; the Familia reparto flow keeps its own hardcoded preset and does not read
  the column). The shape is now `shared/sessionSchemas.ts`: `{enabled, fields:[{slug,label,tipo,
  obligatorio}], uploads:[{slug,label,obligatorio}], tema_obligatorio}`, with presets per program
  `tipo`. The admin config editor renders **domain language only** — never the internal `tipo` slugs
  (`numero|kg|contagem_personas|texto|lista_voluntarios`); field-type choices read as "un número",
  "personas contadas", "archivo que sube el profesor".
- **QR attendance replaces the OCR hoja de firmas in v1** (Leo, superseding the OCR baseline): each
  student's existing QR credential is scanned and validated against node enrollment. OCR of a signed
  paper sheet is deferred unless a funder mandates digitized wet signatures.
- **Compliance lives in the dashboard vertical, not a ProgramaDetalle tab** (Leo). The `/dashboard`
  page already owns monitoring (a `programa` filter + an absence-alerts panel); the session-compliance
  panel (planos/cierres N/M, pending sessions, ≥2-consecutive absences flagged) appears there when a
  session-managed edition is selected. Absence detection is **alert-only** — a human executes any
  baja; it is keyed on `session_id` (not date) with a same-program/day/location fallback for generic
  check-ins, and excludes legacy one-shot closes (no `hora_fin`) from the denominator.
- **Session documents.** `session_documents` rows in a private `program-documents` bucket record the
  required uploads (e.g. "Plan de la clase"). The upload is available **before** closing (so an
  obligatorio upload can be satisfied — otherwise the cierre deadlocks). The professor can upload a
  file **or** photograph a lesson plan → a vision-LLM OCR returns organized markdown (Tema/Objetivos/
  Contenidos/Actividades/Materiales), editable before saving. The public (token-gated) upload caps
  size + mime; `text/html` is excluded (stored-XSS defense) and any future viewer must serve with
  `Content-Disposition: attachment`.

## Consequences

- **+** "Plan for all classes?" is answerable — the materialized calendar is the denominator.
- **+** A teacher with no account closes a class from their phone; the metric can't be gamed by
  who-typed because obligation is on the session and every actor is stamped.
- **+** One config mechanism drives cursos, actividades and (later) comedor; Familia reparto is
  untouched and keeps its own close preset.
- **−** Parent/child and legacy-data coherence is app-enforced, not a DB constraint: pre-migration
  `program_sessions` rows default to `cerrada` and are excluded from compliance by the `hora_fin`
  heuristic rather than a backfill.
- **−** The magic link is a shareable bearer credential; mitigated by short expiry, revocation,
  estado-gating and safe-fields-only responses. A per-token rate limit on the public OCR endpoint is
  a follow-up for `/security-review` before prod.
- **−** OCR quality depends on the platform LLM; the flow degrades to plain file upload when it is
  unavailable, and the professor always reviews/edits the extracted text before saving.
