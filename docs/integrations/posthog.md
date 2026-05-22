# PostHog — Product Analytics + Session Replay (EU)

Privacy-first PostHog integration for Bocatas Digital. Lives in
`client/src/lib/posthog/`. **Disabled by default**; session replay is enabled
(fully masked) only once a key is provisioned.

## TL;DR
- **EU residency:** `api_host = https://eu.i.posthog.com`.
- **Gated:** unset `VITE_PUBLIC_POSTHOG_KEY` ⇒ posthog-js never loads (0 bytes, dead-code-eliminated). This is the **EIPD gate**.
- **Session replay: ENABLED + fully masked** — all text masked, all inputs masked, all media/PII blocked, no canvas, no network bodies.
- **Autocapture: OFF.** Only a closed set of PII-free events.
- **Identify: staff only** (`String(user.id)` + `{role}`), `reset()` on logout. Beneficiaries never identified.
- **`before_send` scrubber** strips email/phone/DNI/NIE + sanitises URLs (defence-in-depth).
- Respects Do Not Track; `optOutCapturing()` exposed.

## How the gate works
`VITE_PUBLIC_POSTHOG_KEY` is read via `import.meta.env`. Vite **inlines** this at build
time. When it's empty (default / CI), `getPostHogKey()` provably returns `undefined`,
`initPostHog()` returns before the dynamic `import("posthog-js")`, and Rollup
**dead-code-eliminates the entire PostHog path** — the library and config strings are not
emitted. So:

| Build | posthog-js in bundle | Lighthouse impact |
|---|---|---|
| Key **unset** (CI/default) | **0 bytes** (not emitted) | none |
| Key **set** (prod) | separate **deferred** chunk, ~**62 KB gzip**, loaded in `useEffect` (after LCP) | deferred; entry unchanged (+~2 KB wrapper) |

The rrweb **recorder is loaded by posthog-js from the EU assets CDN at runtime** — it is
never in our bundle. (Measured 2026-05-22 against an `origin/main` prod build.)

## Files
| File | Role |
|---|---|
| `config.ts` | `buildPostHogConfig()` — the single source of truth (EU host, masking block). `PH_BLOCK_CLASS`. |
| `scrubber.ts` | `before_send` PII scrubber. |
| `pii.ts` | Shared PII detection/redaction/URL-sanitisation primitives. |
| `events.ts` | `KnownEvents` typed map, `STAFF_ROLES`, `assertPiiFree` runtime guard. |
| `client.ts` | `getPostHogKey`, gated `initPostHog`, `capture`, `identifyStaff`, `resetPostHog`, `optOutCapturing`. |
| `PostHogProvider.tsx` | Wraps `<App/>` in `main.tsx`; kicks off gated init. |
| `useIdentifyStaff.ts` | Identifies staff / resets on logout (mounted in `App`). |

## Session-replay masking config (the privacy contract)
`disable_session_recording: false` **with**:
- `maskAllInputs: true`, `maskInputOptions` masking **every** input type.
- `maskTextSelector: '*'` — **all** rendered text masked.
- `blockSelector: '.ph-no-capture'` (+ `blockClass`) — media/PII surfaces fully blocked.
- `recordCanvas: false`, `recordCrossOriginIframes: false`.
- `recordBody: false`, `recordHeaders: false` — **no** network payload capture.
- `sampleRate: 1`, `minimumDurationMilliseconds: 2000`.

### Components carrying `ph-no-capture` (block list)
Default-deny: text everywhere is masked globally; these surfaces render **media** (img/
video/canvas) or sensitive content and are fully blocked from the replay DOM:
- `features/persons/components/QRCodeCard.tsx` — QR `<canvas>`
- `features/checkin/components/QRScanner.tsx` — camera `<video>`
- `features/persons/components/DocumentCaptureInline.tsx` — camera `<video>` + captured doc `<img>`
- `components/PhotoUploadInput.tsx` — photo preview `<img>`
- `components/AnnouncementImageUploader.tsx` — image `<img>`
- `features/persons/components/ConsentModal.tsx` — consent content (`DialogContent`)
- `components/DocumentUploadModal.tsx` — document modal (`DialogContent`)
- `components/DeliveryDocumentModal.tsx` — delivery doc modal (`DialogContent`)
- `features/uploads-tab/ClassifyModal.tsx`, `UploadModal.tsx` — document modals (`DialogContent`)

> Document **archive** views (`ArchiveExplorer`, `DocumentosTab`, `SignedActaUpload`)
> open files via signed URLs in a **new tab** — never rendered inside the replayed DOM.

## Events (PII-free, typed)
```ts
import { capture } from "@/lib/posthog";
capture("checkin_completed", { method: "qr" });   // method ∈ qr|manual|anonymous
capture("person_registered", {});
capture("document_uploaded", { type: documentoTipo }); // category label, not a doc number
```
`capture` calls `assertPiiFree` and **throws** on any PII-shaped key/value. Demo/practice
check-ins are not tracked.

## Enable in production
1. **Sign the EIPD addendum** (`docs/legal/eipd-addendum-posthog-session-replay-DRAFT.md`) — it MUST cover session replay.
2. Confirm a DPA with PostHog EU + set retention in the PostHog project.
3. **Verify masking in staging** on a real PII-bearing screen (see below).
4. Set `VITE_PUBLIC_POSTHOG_KEY` (the `phc_…` value) in **deployment secrets only** — never in `.env.example` or git.
5. Optionally set `VITE_PUBLIC_POSTHOG_HOST` (defaults to `https://eu.i.posthog.com`).

## Rollback
**Unset `VITE_PUBLIC_POSTHOG_KEY`** and redeploy. posthog-js stops loading entirely; no
events, no replay, no bundle cost. No code change required.

## Replay-masking verification (run in staging before flipping prod)
1. Build/serve with the staging key set.
2. Open a screen showing a (test) person's DNI + document photo (e.g. PersonaDetalle / registration Step 2).
3. Interact, then open the recording in PostHog → Session Replay.
4. **Confirm:** all text shows as masked blocks; the document/photo `<img>` and QR are blocked (not visible); no API bodies in the network tab of the replay.
5. Paste a screenshot into the activation ticket as evidence.
