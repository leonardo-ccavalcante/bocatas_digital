# Spec — Cierre de brechas abiertas (BR-1 … BR-7)

> **Scope:** the seven *brechas abiertas* reported by the product owner: open technical
> gaps, deferred decisions, and pending legal sign-offs. This spec states, for each
> gap, the **verified** code evidence, the decision to take, the acceptance criteria,
> and what is explicitly out of scope.
>
> **Evidence discipline:** every claim below carries a `file:line` anchor read at
> commit `e4991ae`. Claims sourced from the reporter (production counts) are marked
> **[reported, unverified in repo]** — they need a prod query before being treated as fact.
>
> Companion documents:
> - SAT verification per wave (KAC · ACH · Devil's Advocacy · What If):
>   `docs/superpowers/findings/2026-08-23-brechas-abiertas-sat.md`
> - Wave 1 deploy procedure (blocking pre-deploy audit):
>   `docs/runbooks/auth-source-of-truth-cutover.md`
>
> The waves themselves are sections of this document, not a separate plan file — one
> document is one thing to keep true.

---

## 0. Summary table

| ID | Brecha | Class | Severity | Fixable in code? |
|---|---|---|---|---|
| **BR-1** | `auth.users` ↔ `app_users` desynchronised | Security + availability | **P0** | Yes |
| **BR-2** | Check-in has no authorship (`registrado_por` always NULL) | Traceability / RGPD accountability | P2 | Yes |
| **BR-3** | Reparto sizing uses declared counters, not real members | Data integrity | P1 | Yes (partly product) |
| **BR-4** | Novedades audiences use a frozen 6-value enum | Correctness (live bug) | P1 | Yes |
| **BR-5** | Informe-social PDF preview needs LibreOffice on the host | Infra dependency | P3 | Deploy-side, not code |
| **BR-6** | `upsert_legacy_person` silently drops new person columns | Data loss (latent) | P2 | Yes (guard) |
| **BR-7** | Three EIPD addenda unsigned + firma-en-pantalla gated off | Legal | **Blocking for go-live** | No — legal decision |

**Only BR-1 is a live production incident.** BR-4 is a live silent bug. The rest are
latent, deferred, or legal.

---

## BR-1 — `auth.users` ↔ `app_users` desynchronisation

### What is actually true (verified)

1. **The read path** is `authenticateRequest` → `getUserById(authUser.id)` →
   `public.app_users` (`server/_core/authenticateRequest.ts:94`, `server/db.ts:62-70`).
   When no `app_users` row exists the function returns `null`
   (`authenticateRequest.ts:94`), `ctx.user` is unset, and **every** procedure
   throws `UNAUTHORIZED` via `requireUser` (`server/_core/trpc.ts:76-80`). The client
   reads its identity and role from `trpc.auth.me` (`client/src/_core/hooks/useAuth.ts:19`),
   so the UI renders an empty shell. This is exactly the reported symptom.

2. **The write path** is `auth.users.app_metadata` only. `admin.createStaffUser`
   (`server/routers/admin.ts:82-90`), `admin.setUserRole` (`admin.ts:144-147`) and
   `admin.revokeStaffAccess` (`admin.ts:224-228`) all call
   `supabase.auth.admin.*` and **never touch `app_users`**. The only writer of
   `app_users` is `db.upsertUser`, called exclusively from the **legacy Manus OAuth
   path** `server/_core/sdk.ts:278,296` — dead code since login migrated to Supabase
   Auth in #142/#143.

3. **`app_users` does not exist in the repo.** There is **no migration** creating it
   (`supabase/migrations/` has zero `app_users` files) and **no entry** in
   `client/src/lib/database.types.ts` (grep count: 0) — which is why `server/db.ts:10`
   needs an untyped client with the comment *"table not in generated Database types yet"*.
   The table is production-only, created by hand. `supabase db reset` does not create it,
   so **login cannot work on a clean local/CI database at all**. This is the same
   repo↔prod drift class as ADR-0011 / issue #116.

4. **[reported, unverified in repo]** 15 rows in `auth.users`, 11 in `app_users`.

### The consequence nobody filed: revocation does not revoke

`revokeStaffAccess` sets `app_metadata.role = null`. The server never reads
`app_metadata`. A revoked user who **already has an `app_users` row keeps their old
role indefinitely** — `getUserById` returns it unchanged. The same applies to
`setUserRole`: a promotion or demotion has **no effect** on a user who can already log
in. The 11 users who work are precisely the 11 whose privileges cannot be changed or
withdrawn through the UI.

Severity: this is a **privilege-revocation failure**, not a convenience bug. It is why
BR-1 is P0 rather than P1.

### Decision

**`auth.users` is the single source of truth for identity and role. There is no second
user store — `app_users` stops being read at all.**

> **Superseded, deliberately.** An earlier draft of this spec kept `app_users` as a
> *projection*, with just-in-time provisioning (D1.3) and a `CREATE TABLE` migration
> (D1.4). A root-cause review killed both. Verified: outside `server/db.ts` and the
> importer-less `server/_core/sdk.ts`, the app reads only `ctx.user.{id, role, name,
> email}` — 77 / 19 / 5 / 1 sites — plus one `openId` that already fell back to the auth
> id; `loginMethod` and `lastSignedIn` have **zero** consumers. `app_users` carries
> nothing `auth.users` does not. It was never a projection worth maintaining; it was the
> defect. The fix is to stop reading it, not to synchronise it — which also deletes the
> migration, the types regen and the provisioning code that D1.3/D1.4 required.

- **D1.1 — Role is read from `app_metadata` on every request.** `authenticateRequest`
  already holds the `authUser` returned by `supabase.auth.getUser(token)`. That call is
  an HTTP round-trip to GoTrue's `/user`, authenticated with the **caller's** token (the
  service-role key rides along only as `apikey`), and GoTrue resolves it against the live
  `auth.users` row — *not* a local decode of stale JWT claims. That is what makes a role
  change effective on the next request rather than at the next token refresh.
- **D1.2 — Absent, null, or unrecognised role denies access.** ⇒ `authenticateRequest`
  returns `null` ⇒ `UNAUTHORIZED`. This is what restores `revokeStaffAccess` (which
  writes exactly `role: null`), and it denies self-registered accounts, which never get a
  role. **It does not close S-06** — see the correction under D1.4 below.
- **D1.3 — `app_users` is left in production, untouched and unread.** No migration, no
  types regen, no drift gate involved. Dropping it is irreversible and buys nothing;
  retiring it is a follow-up, and `docs/runbooks/auth-source-of-truth-cutover.md` step 6
  carries the `pg_depend` check that must precede it. *(Replaces the old D1.3/D1.4.)*
- **D1.4 — S-06 is NOT closed by this change.** An earlier draft claimed it was. S-06 is
  direct PostgREST access with an `authenticated` JWT against the reparto tables; that
  path never touches `authenticateRequest`. Disabling GoTrue self-signup and deploying
  `20260707000006_harden_reparto_rls.sql` remain outstanding, and the cutover runbook
  treats disabling signup as blocking for a second reason too: `createStaffUser` leaves a
  role on an *unconfirmed* account, so open signup plus `mailer_autoconfirm` lets a third
  party take it over with the role already attached.
- **D1.5 — No dual-write in `admin.ts`.** It would create a second writer for something
  that is no longer stored, and D1.1 already makes role changes immediate.

### Acceptance criteria

- **AC1.1** A staff user created via `admin.createStaffUser` can log in and reach a
  role-appropriate UI **with no manual DB insert**.
- **AC1.2** After `revokeStaffAccess`, the next request from that user is
  `UNAUTHORIZED`.
- **AC1.3** After `setUserRole`, the next request carries the new role.
- **AC1.4** An authenticated Supabase user with **no** recognised `app_metadata.role` is
  denied.
- **AC1.5** The tests fail under mutation, not merely on revert — verified for a
  `?? "user"` role fallback, an anon key in place of the service-role key, and a swap of
  `updatedAt`/`lastSignedIn`.
- **AC1.6** No regression: the pre-change and post-change full-suite baselines show the
  same failures, in the same files.
- **AC1.7** No PII (email, name) appears in any log line added by this work — IDs only.
- **AC1.8** The blocking pre-deploy audit in
  `docs/runbooks/auth-source-of-truth-cutover.md` is completed and its counts recorded on
  the issue **before** the change reaches production.

### Out of scope

Linking staff `auth.users` rows to `persons` rows. That is the unresolved
`TODO(jwt-migration)` at `server/routers/announcements/reads.ts:38-45` and it needs its
own product decision (see BR-4, Open Question OQ-4.2).

---

## BR-2 — Check-in has no authorship

### Verified

- `attendances.registrado_por UUID REFERENCES auth.users(id)` exists, and is indexed
  (`supabase/migrations/20260411081833_20260410120300_create_attendances.sql:12,28`).
- `checkin.verifyAndInsert` deliberately omits it, with the comment
  *"registrado_por: null (no Supabase auth.uid() available with Manus OAuth)"*
  (`server/routers/checkin.ts:153`). `anonymousCheckin` (`checkin.ts:233`) and the
  offline-sync batch path (`checkin.ts:374`) omit it too.
- `consents.registrado_por` has the identical shape and the identical gap
  (`20260411081836_20260410120500_create_consents.sql:19`).
- **The stated blocker is gone.** `ctx.user.id` is now the `auth.users` UUID —
  `getUserById(authUser.id)` keys `app_users.id` on the auth id
  (`authenticateRequest.ts:94`, `db.ts:62-70`). The value the column wants is in hand.

### The ADR conflict — must be resolved, not stepped around

ADR-0011 decided that actor-identity columns are **`text`, not `uuid`-FK**, and its
stated premise is *"Authentication is Manus OAuth, not Supabase Auth"*. **That premise
is now false.** ADR-0011 also explicitly lists `attendances.registrado_por` and
`consents.registrado_por` as "inconsistent, follow-up, out of scope".

Writing a UUID into those columns is therefore **not** a violation of ADR-0011's intent
— it is the case ADR-0011 could not serve. But it *is* a contradiction of its literal
text, and AGENTS.md forbids silently overriding a recorded decision.

**Decision: supersede ADR-0011 with a new ADR** ("Actor identity is the Supabase auth
UUID") that keeps `attendances`/`consents` as `uuid` FK, and records that the already-
migrated `text` columns (`deliveries.registrado_por`, `announcements.autor_id`,
`programs.created_by`, …) stay `text` — converting them is a separate, unfunded
migration with no user-visible benefit. The new ADR must say that explicitly so the
next agent does not "finish the job" and break production.

### Acceptance criteria

- **AC2.1** `verifyAndInsert` writes `registrado_por = ctx.user.id`.
- **AC2.2** `anonymousCheckin` writes it too (an anonymous *beneficiary* still has a
  known *operator*).
- **AC2.3** The offline-sync batch writes it for every row in the batch, and the
  `onConflict` inference of ADR-0007 is unchanged (`registrado_por` is not part of the
  unique index — verified against
  `20260411081833…:21-23`).
- **AC2.4** Duplicate-detection, demo-mode short-circuits, and the 23505/23503 error
  paths are behaviourally unchanged.
- **AC2.5** A new ADR supersedes ADR-0011 and ADR-0011 is annotated as superseded.
- **AC2.6** No PII in logs; `registrado_por` is an opaque UUID, never rendered as a
  name in any export without a role gate.

### Out of scope

Backfilling historical NULL rows — the information does not exist. Surfacing the
operator in the UI (a separate product ask; needs a role gate decision).

---

## BR-3 — Reparto sizing uses declared counters, not real members

### Verified

Family size has **two** representations and the reparto uses the weaker one:

| Source | Where | Used by |
|---|---|---|
| `families.num_adultos + families.num_menores_18` (declared) | `get_active_families_for_reparto` (`supabase/migrations/20260723000002…:33`) | reparto assignment + kg split (`server/routers/families/rounds-activation.ts:60,65,77-78`) |
| same, again | `server/services/notaEntregaComputer.ts:32` | nota de entrega kg |
| same, again | `server/services/documentContextBuilder.ts:132` | informe social / documents |
| `familia_miembros` rows (real) | canonical member store since the `miembros` JSON column was dropped (`server/routers/families/crud.ts:183-184`) | family detail UI, documents member list, signatures |

`get_active_families_for_reparto` also applies `GREATEST(COALESCE(num_adultos,1) +
COALESCE(num_menores_18,0), 1)` — so a family with **both counters NULL** is silently
sized as **1 person** and receives a 1-person ration. It does not fail loudly; it
under-serves quietly. That is the actual risk, and it is worse than the reported
"the calculation will fail".

`documentContextBuilder.ts:129-131` already carries a comment acknowledging that
"members count staleness is a separate data-integrity concern, not fixed here".

### Decision — do **not** switch the source of truth

Switching the reparto to `count(familia_miembros)` would be **wrong today**: the mass
legacy import populated the declared counters but not individual members, so counting
members would size most families at 0–1 and **cut real rations**. That is a
larger harm than the current one.

**Decision: keep the declared counters as the computation input, and make divergence
and absence visible and fixable.**

- **D3.1** Fix the one site that lies. Three call sites compute `num_adultos +
  num_menores_18`, but only `get_active_families_for_reparto` wraps it in
  `GREATEST(COALESCE(...,1)...,1)` and so turns *unknown* into *one*. Extracting a shared
  helper for an addition is the premature abstraction AGENTS.md forbids; the RPC returns
  a nullable `total_miembros_declarado` alongside the coerced value instead, so callers
  can tell the two apart.
- **D3.2** Absence stops being silent. A family whose counters are both NULL must be
  surfaced to the operator **before** activation, not defaulted to 1. `previewAssignments`
  is the natural gate — it already exists and is read-only
  (`rounds-activation.ts:88-96`).
- **D3.3** Divergence is reported, not enforced. Where `familia_miembros` count and the
  declared total disagree, show it. Do not auto-correct either direction — the operator
  (Sole) decides which is true, per family.
- **D3.4** Data quality gets a surface: a list of families with missing or divergent
  counters, so the backlog can actually be worked down.

### Acceptance criteria

- **AC3.1** A single exported function computes `total_miembros` from a family row, and
  all three call sites use it.
- **AC3.2** `previewAssignments` reports the count of families with NULL/absent
  counters and the count with declared-vs-members divergence, per round.
- **AC3.3** Activation is **not** blocked by divergence (operational continuity), but
  the operator sees the numbers first.
- **AC3.4** Rations for families with complete data are **bit-identical** to today —
  proven by test, not asserted.

### Open question for the product owner

**OQ-3.1** Should activation be *blocked* when >N% of families have NULL counters, or
only warned? Recommendation: warn only in v1; blocking a monthly distribution on a data
quality metric risks families not eating.

---

## BR-4 — Novedades audiences use a frozen 6-value enum

Tracked as **issue #131** (open). This spec supersedes that issue's scope with one
addition it does not mention.

### Verified

- `announcement_audiences.programs` is typed `programa[]` — the **PostgreSQL ENUM**
  from `20260411081827_20260410120001_create_enums.sql:52-54`, six values:
  `comedor, familia, formacion, atencion_juridica, voluntariado, acompanamiento`.
- Four hardcoded mirrors of that list exist (`shared/announcementTypes.ts:74-81`,
  `server/routers/announcements/_shared.ts:31`,
  `client/src/features/announcements/hooks/useAudienceOptions.ts:16-27`,
  `client/src/pages/AdminNovedades/_shared.ts:3`).
- `shared/announcementTypes.ts:60-73` carries an explicit warning that editing the array
  without a matching column migration produces a `42804` on write. That warning is
  correct and must be honoured.
- Check-in already solved this pattern: `attendances.programa` was migrated to
  `text` + FK to `programs.slug`, validated by format only
  (`server/routers/checkin.schemas.ts:14-25`).

### The live bug the issue understates

`20260507000002_rename_familia_slug_to_programa_familias.sql:14-16` renamed
`programs.slug` `'familia'` → `'programa_familias'`. Audience matching compares
`announcement_audiences.programs` values against `programs.slug`
(`server/routers/announcements/reads.ts:56-61`). The enum still says `familia`; no slug
`familia` exists any more.

**Any novedad targeted at the Programa de Familias matches nobody, today, silently.**
This is not a future risk — it is a current defect, and it is why BR-4 is P1.

### Decision

Apply the check-in pattern exactly: **`announcement_audiences.programs` becomes
`text[]`, validated by slug format, with existence enforced against the `programs`
catalog.** The four hardcoded arrays are deleted; the client reads the live catalog.

- **D4.1** Migration converts the column `programa[]` → `text[]`, existence-tolerant
  (guard `undefined_table`/`undefined_column`/`undefined_object` together per AGENTS.md).
- **D4.2** The migration **remaps `'familia'` → `'programa_familias'`** in existing
  rows, repairing the silent breakage.
- **D4.3** Validation mirrors `ProgramaSlug` (`^[a-z0-9_]+$`, 1–64) — digits included,
  edition slugs carry a year.
- **D4.4** Existence: a per-element check against `programs.slug` at write time. Unlike
  `attendances.programa` this is an **array** column, so a single-column FK is not
  available; the check is explicit in the router. One validation point, not two — a
  trigger would duplicate it and be another thing to keep in sync.
- **D4.5** `useAudienceOptions` reads `programs.listado`, not a literal.

### Acceptance criteria

- **AC4.1** A program created through the admin UI after deploy can be selected as a
  novedad audience and the write succeeds.
- **AC4.2** Existing rows containing `'familia'` are migrated to `'programa_familias'`,
  and a novedad targeted at Familias reaches enrolled beneficiaries again.
- **AC4.3** An unknown slug is rejected with a Spanish `BAD_REQUEST`, never a `42804`.
- **AC4.4** All four hardcoded arrays are gone. A test asserts no literal program-slug
  list remains in the announcements lane.
- **AC4.5** The `programa` enum type itself is **not** dropped — `checkin`'s history and
  other columns may still reference it. Converting the column does not require removing
  the type.

### Open questions

- **OQ-4.1** Should a child program in the tree (ADR-0013) inherit its parent's
  audience targeting, or must it be selected explicitly? Recommendation: explicit in v1;
  inheritance is a separate feature with its own confusion surface.
- **OQ-4.2** The enrollment lookup at `reads.ts:49` filters
  `program_enrollments.person_id = String(ctx.user.id)`. With Supabase Auth,
  `ctx.user.id` is an `auth.users` UUID while `person_id` references `persons.id` —
  **still not the same key**. The `TODO(jwt-migration)` is therefore **not** resolved by
  the auth migration, and program-scoped visibility returns empty for every user. This
  needs an auth-user ↔ person link decision and is **out of scope here** — filed
  separately.

---

## BR-5 — Informe-social PDF preview needs LibreOffice on the host

### Verified

- `server/services/docxToPdf.ts` shells out to `soffice`, probing four absolute paths
  (`docxToPdf.ts:38-49`), serialises conversions, and throws a typed
  `LibreOfficeUnavailableError` when the binary is absent (`docxToPdf.ts:18-23`).
- `families.getSocialReportPdf` catches it and returns `PRECONDITION_FAILED` with a
  Spanish message, so the client falls back to `.docx` download
  (`server/routers/families/documents.ts:145-152`).
- A setup runbook exists: `docs/runbooks/libreoffice-setup.md`.
- The design rationale is recorded at `documents.ts:120-127`: pure-JS docx renderers
  drop the running header (membrete) and the floating signature, so the preview would be
  *wrong*, not merely different.

### Assessment

**This is correctly built and correctly degraded.** It is a deployment prerequisite, not
a defect. The failure mode is a clear Spanish message plus a working `.docx` download —
the legally-operative artifact is the `.docx`, and it never depended on LibreOffice.

### Decision

**No code change.** Two documentation/ops actions only:

- **D5.1** State the dependency where deployment decisions are made, not only in a
  runbook a reader must already know exists.
- **D5.2** Add a startup-time probe **log line** (not a failure) so an operator learns
  the preview is unavailable at boot rather than from a user's failed click.

### Acceptance criteria

- **AC5.1** The server logs, once at boot, whether `soffice` was found and at which path.
- **AC5.2** The dependency is named in the deployment documentation.
- **AC5.3** No behavioural change to the `.docx` path, and no new hard dependency —
  a host without LibreOffice must still boot and serve everything else.

---

## BR-6 — `upsert_legacy_person` silently drops new person columns

### Verified

- `upsert_legacy_person` (current definition:
  `supabase/migrations/20260604000001_fix_legacy_person_dedup_by_document.sql:19-101`)
  inserts **18** columns.
- `persons` has **~57** columns (`client/src/lib/database.types.ts:1806-1863`).
- It is the sole person-writer for the legacy family importers — called at four sites
  across `20260605000001…:327,357,393` and `20260604000002…:107,149`.
- AGENTS.md already states the rule ("Every new typed person column must be taught to it
  explicitly, or imports silently drop that field"). **The rule has no enforcement.**

The gap is not the function — it is that **nothing fails** when someone forgets. A
documented rule with no gate is a rule that will be broken.

### Decision

**Make forgetting loud.** The column list becomes an asserted invariant, not a
convention.

- **D6.1** A test enumerates the columns the function writes and the columns `persons`
  exposes, and fails when a column is in `persons` but neither written nor **explicitly
  declared out-of-scope** with a reason.
- **D6.2** The out-of-scope list is data, in one place, with a one-line justification
  per column (e.g. `foto_documento_url` — no legacy source; `distrito` — derived by
  trigger; `situacion_legal` — Art. 9, never bulk-imported).
- **D6.3** No behavioural change to the function in this pass. Deciding which of the
  ~39 unwritten columns *should* be imported is a data question for Sole, not an
  engineering one — the guard exists to force that conversation the next time a column
  is added.

### Acceptance criteria

- **AC6.1** Adding a column to `persons` without updating either the function or the
  declared out-of-scope list fails a test with a message naming the column.
- **AC6.2** The test reads the real migration text and the real generated types — not a
  hand-maintained duplicate that can itself drift.
- **AC6.3** The current state passes (every one of the ~39 unwritten columns is
  explicitly justified) — producing, as a side effect, the first complete inventory of
  what the legacy import does and does not carry.

---

## BR-7 — EIPD addenda unsigned + firma en pantalla gated off

### Verified

Three drafts, all clearly marked *do not process real data until signed*:

| Draft | Data | Collected today? |
|---|---|---|
| `docs/legal/eipd-addendum-colectivos-DRAFT.md` | Art. 9/10: población gitana, LGTBI, sin hogar, reclusos | **Yes** |
| `docs/legal/eipd-addendum-derivar-DRAFT.md` | Derivations/interventions shared with third parties | **Yes** |
| `docs/legal/eipd-addendum-posthog-session-replay-DRAFT.md` | Analytics + masked session replay | **No** — inert, no key set |

Code-side controls that already exist:

- **Colectivos:** consent-gated (`colectivo_consentimiento` is transient, not a column —
  `server/routers/persons/_shared.ts:61-64`) and `colectivo_otros` is encrypted at rest
  when PII crypto is configured (`server/routers/persons/crud.ts:183-186`). The IRPF
  report uses colectivo as a **marginal-only** breakdown
  (`server/routers/reports/templated/informeIrpfDemografico.ts:23`).
- **PostHog:** dead-code-eliminated until `VITE_PUBLIC_POSTHOG_KEY` is set.
- **Firma en pantalla:** `REPARTO_FIRMA_ENABLED` env-presence gate; unset ⇒
  `PRECONDITION_FAILED` and the UI hides the flow — server is the single source of truth,
  no client flag to drift (`server/routers/families/rounds-signature.ts:12-28`,
  `client/src/features/familias-reparto/components/CloseoutDayView.tsx:35,52-55`).

### Assessment

The engineering posture is **correct and complete**. Two of the three are the same
category of problem and one is not:

- **PostHog** and **firma en pantalla** are *not yet processing*. The gate holds. There
  is no compliance exposure — only a blocked feature.
- **Colectivos** and **derivar** are *already processing real special-category data
  against unsigned addenda*. The technical safeguards are good; the **legal basis is
  incomplete**. That is an organisational exposure that no code change can close.

### Decision

**No code change closes BR-7. Do not build a workaround.** Specifically: do **not** add
a kill-switch env flag for colectivos/derivar. Turning off collection of data already
collected does not cure the period during which it was collected, it loses funder-
required data, and it substitutes an engineering gesture for a legal decision that only
Leo and the RGPD lawyer can make.

What engineering **can** own:

- **D7.1** A single status page listing the three addenda, what each gates, who owns it,
  and what flips when it is signed — replacing three drafts a reader has to find.
- **D7.2** `docs/runbooks/eipd-status.md` is **incomplete, not wrong**: it predates all
  three addenda and does not reference them. Its finding that no base EIPD exists in the
  repo still stands — it globs `docs/legal/EIPD*` and means the base document; the three
  files are lowercase `eipd-addendum-*` and are addenda, not the base. Add them; leave
  the base-EIPD finding in place.
- **D7.3** Record the exact one-line change that activates each gate, so signature day is
  a five-minute deploy and not a re-investigation:
  `VITE_PUBLIC_POSTHOG_KEY=<key>` · `REPARTO_FIRMA_ENABLED=1` · colectivos/derivar
  require **no** code change (already live — signature legalises, it does not enable).

### Acceptance criteria

- **AC7.1** One status document, linked from the compliance section of the playbook.
- **AC7.2** The stale runbook no longer asserts the EIPD documents are absent.
- **AC7.3** No new feature flag, kill switch, or gate is introduced.
- **AC7.4** The two *already-collecting* activities are escalated to Leo in writing,
  distinct from the two that are merely blocked.

### The decision that is not ours

Firma en pantalla stays off until the RGPD lawyer confirms on-screen signatures are
equivalent to wet signatures for **Banco de Alimentos** subsidy inspection. AGENTS.md
already records this as a hard rule. Note the neighbouring open issue **#128** (physical
bank Sign Pad) — a hardware path that may satisfy the inspector where a tablet does not.
That is the alternative to put to the lawyer, and it is a better question than
"can we turn the flag on".
