# PWA / Service Worker Update Path

The app registers a service worker via `vite-plugin-pwa` (configured in
[`vite.config.ts`](../../vite.config.ts), wired in
[`client/src/lib/swUpdate.ts`](../../client/src/lib/swUpdate.ts)).

## What gets cached

- App shell HTML, CSS, JS, fonts (precached at install).
- Google Fonts requests (StaleWhileRevalidate / CacheFirst).
- API calls to `/api/`, `/trpc/`, `/auth/` are NEVER cached — passthrough.

## Update flow

1. New build → `sw.js` content hash changes.
2. SW polls every 60 minutes for updates (see
   [`registerSwUpdateToast`](../../client/src/lib/swUpdate.ts)).
3. When new SW detected → sonner toast: "Nueva versión disponible — toca
   para actualizar la aplicación."
4. User taps "Actualizar" → SW activates → `location.reload()`.

## Forcing an update for all users (deploy day)

If a deploy includes a critical fix, you can shorten the update window:

1. Trigger a deploy as normal.
2. The SW update poll fires within 60 min — every active client sees
   the toast.
3. To force-refresh sooner, the user must close + reopen the tab (or
   manually clear site data).

## Disabling the SW (rollback)

If a deploy breaks via the SW (caching the wrong version):

1. Push a build with `VitePWA({ selfDestroying: true })` in
   `vite.config.ts`.
2. Deploy. Active SWs auto-unregister on next page load.
3. Once propagated, restore the standard `VitePWA` config.

## Known limitations (Phase 6.b state)

- **Icons:** The current `bocatas-logo.png` is 148×148 — under the PWA spec
  (192/512). Install prompts on Android may not fire until proper icons
  ship.
- **Real-device offline test pending:** the §B.2.3 manual gate ("airplane
  mode → reload → app shell loads") needs to run on a Moto G4 / Samsung A12
  before the §6 gate is fully green.
- **Dev mode disabled:** `devOptions.enabled = false` — the SW runs only
  in production builds. Dev relies on standard Vite HMR.
