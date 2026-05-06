# F-002 Stakeholder Q&A — Manus `openId` ↔ `persons.id` mapping

**Status:** AWAITING ANSWERS · **Blocks:** §4.D.D.2 onward

Per plan §4.D, code MUST NOT be written until this matrix is filled. The cost of
building the wrong mapping model is higher than the cost of the existing `MiQR.tsx`
stub; the stub correctly returns "no disponible aún" while the questions remain open.

---

## Decision matrix

| # | Question | Answer (TBD with Leo / Espe / Sole) | Decided by |
|---|---|---|---|
| 1 | Who is allowed to access `MiQR.tsx`? Just registered Manus users (`/login` flow), or all `persons` rows including those volunteer-registered who never sign up? | _pending_ | Leo |
| 2 | When a Manus user signs up, who associates them with their `persons` row? Self-service via email match, or admin-driven (volunteer presses "Asociar cuenta de usuario" on the person detail page)? | _pending_ | Espe + Sole |
| 3 | Email-match risk: a beneficiary with a shared family email (Sole confirmed several titulares share their hijo's email) could accidentally link to another person's record. Acceptable, or admin approval required for ALL links? | _pending_ | RGPD lawyer + Leo |
| 4 | What happens to existing live QR cards (printed pre-QA-1A in JSON format)? Re-issue all on next visit, or accept a transition window where both QR formats are scannable? | _pending_ | Espe + Nacho |
| 5 | Should `persons.auth_open_id` be visible in the admin UI (debug column on the person detail page) or strictly internal (only used in middleware lookup)? | _pending_ | Leo |

---

## Once answered — what gets built

Assuming the most likely outcome (admin-driven 1:1 mapping with self-service email
fallback), the §4.D plan flow becomes:

1. **D.2** — Migration: `ALTER TABLE persons ADD COLUMN auth_open_id TEXT` + unique
   partial index `WHERE auth_open_id IS NOT NULL AND deleted_at IS NULL`. RLS policy
   that lets a person read their OWN row when `auth_open_id = current_user_open_id()`.
2. **D.3** — Server: `persons.linkAuthUser({ personId, openId })` adminProcedure with
   duplicate-link rejection + idempotency.
3. **D.4** — Context middleware: resolve `ctx.person` from `auth_open_id` lookup; cache
   in-memory per session.
4. **D.5** — Server: `persons.getMyQrPayload()` protectedProcedure that wraps
   `getQrPayload({ personId: ctx.person.id })` with explicit "must be linked" guard.
5. **D.6** — Client: un-stub `MiQR.tsx` with branch on `ctx.person` presence. Render
   canonical QR when linked; friendly "pídele a un voluntario que te asocie" message
   when not.
6. **D.7** — Admin UI: "Asociar cuenta de usuario" button on person detail.
7. **D.8** — Tests: linkAuthUser dedup; getMyQrPayload guard; MiQR branch behavior.
8. **D.9** — Update `qr-no-pii.test.ts`: drop the MiQR `must NOT contain QRCode.toCanvas`
   lock now that it's a real generator. Replace with the same PII-key check as
   `QRCodeCard.tsx`.
9. **D.10** — Update `docs/runbooks/eipd-status.md` to register `persons.auth_open_id`
   as a tracked PII column (de-facto identifier).

---

## Why this is gated, not staged

If we built D.2-D.10 against the wrong mapping model and discovered (Q3) that admin
approval IS required for every link, we'd:
- Have a self-service flow with no UX path for admin review.
- Need a schema migration to add `auth_open_id_pending` + `auth_open_id_approved_at`.
- Force re-issue of all QRs that were generated under the wrong assumption.

The cost of a 1-2 day wait for the answers is much lower than the cost of a wrong
build + rebuild cycle.
