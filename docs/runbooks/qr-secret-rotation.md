# QR signing-secret rotation

> **Phase 6 QA-1A:** server-side secret used to HMAC-sign canonical QR payloads
> (`bocatas://person/<uuid>?sig=<hmac8>`). See `shared/qr/payload.ts`.

## Why rotate

- Suspected leak (anyone with the secret can forge a valid QR for any person.id)
- Annual hygiene
- Personnel changes (someone with prod-env access leaves)

## Pre-rotation checklist

- [ ] `QR_SIGNING_SECRET` is set in the prod env (Vercel / Supabase / Manus). Generate the new value:
  ```bash
  openssl rand -hex 32   # 64-char hex = 256-bit secret
  ```
- [ ] You have prod-env access to add/replace env vars and redeploy.

## Rotation procedure (zero-downtime, 24h grace window)

The current implementation accepts ONE secret at a time. To avoid invalidating
all live QR cards at the moment of rotation, run a 24h grace window:

1. **Day 0 — schedule.** Generate the new secret. Decide a cutover time
   when scan volume is lowest (overnight in Madrid TZ).
2. **Day 0 — pre-stage.** Add the new secret as `QR_SIGNING_SECRET_NEW` to
   the environment without removing the old. (Code does NOT yet read it
   — staging only.)
3. **Day 1 — code change.** Open a PR that updates
   `server/routers/persons/qr.ts:getCheckinTarget` to verify the sig
   against EITHER `QR_SIGNING_SECRET` (legacy) OR `QR_SIGNING_SECRET_NEW`.
   Ship to prod.
4. **Day 1 — flip primary.** Update `getQrPayload` (and `getMyQrPayload`
   when the F-002 fix lands) to BUILD with `QR_SIGNING_SECRET_NEW`. New
   cards now use the new secret; old cards still verify under the legacy.
5. **Day 14 — drop the old.** Once the longest-lived QR card you care
   about (printed PDFs, etc.) is past its scan-frequency tail, remove
   the OR-branch from `getCheckinTarget`, set
   `QR_SIGNING_SECRET = QR_SIGNING_SECRET_NEW`, delete `QR_SIGNING_SECRET_NEW`.

## Emergency rotation (suspected leak)

If you must invalidate every live QR immediately:

1. Generate new secret + set `QR_SIGNING_SECRET`.
2. Redeploy (no code change needed — just env restart).
3. Every existing QR card stops scanning. Volunteers fall back to manual
   search (`Sin QR` button — already first-class in `CheckIn.tsx`).
4. Re-issue QR cards on the next visit; the canonical URI is regenerated
   server-side on demand.
5. Open a post-incident review covering: how the secret leaked, whether
   any forged QRs were scanned in the window, whether to add `?sig=` to
   16 chars (currently 8) per Phase 6 plan §J Red Team note.

## Code references

- `shared/qr/payload.ts` — `buildQrPayload`, `parseQrPayload`, `verifySig`
- `server/routers/persons/qr.ts` — secret resolution + verification
- `server/_core/env.ts` — `qrSigningSecret` env wiring
- `server/__tests__/qr-no-pii.test.ts` — regression guard

## Owner

- **Code-side:** persons feature owner.
- **Operations:** whoever owns `QR_SIGNING_SECRET` in the deployment env.
