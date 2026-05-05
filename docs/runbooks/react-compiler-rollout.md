# React Compiler — Rollout Plan

## Status

- **Plugin installed:** `babel-plugin-react-compiler@1.0.0` (devDep).
- **Wiring:** [`vite.config.ts`](../../vite.config.ts) — opt-in via `VITE_REACT_COMPILER=1`.
- **Default:** OFF (production builds compile without it).

## What it does

The React Compiler is a Babel plugin that automatically memoizes components, hooks,
and intermediate values that React would otherwise re-render unnecessarily. It replaces
manual `useMemo` / `useCallback` / `React.memo`. For Bocatas Digital this is most
valuable on:

- The check-in flow (XState transitions trigger many re-renders).
- The persons list (TanStack Query result + local filter state).
- The dashboard (Realtime subscription causes re-renders on every attendance event).

## How to enable locally

```bash
echo "VITE_REACT_COMPILER=1" >> .env.local
pnpm build
pnpm preview
```

## Pre-rollout checklist

Before flipping the env var in production, the following must be verified:

- [ ] `pnpm test` 100% green with the flag ON (currently 19/880/26 baseline).
- [ ] `pnpm build` succeeds (no compiler errors on any component).
- [ ] Real-device manual smoke on at least Moto G4 (Android 7) and Samsung A12 (Android 11):
  - [ ] Login → list persons → register new person → upload photo → submit
  - [ ] Check-in flow (QR scan or "Sin QR" manual fallback) → no stale render bugs
  - [ ] Dashboard with Realtime subscription → ensure live updates still propagate
  - [ ] Programs admin → toggle filters → confirm no double-fire on TanStack queries
- [ ] Bundle size delta inspected (Compiler can ADD code; verify per-route chunk stays
      ≤100 KB gz cap from `docs/runbooks/perf-budgets.md`).
- [ ] LCP measurement on Moto G4: stays ≤1.5 s with flag ON.

## Known gotchas

- React Compiler requires components to follow the [Rules of React](https://react.dev/reference/rules)
  strictly. Files that mutate state inside render or read refs synchronously will fail
  compilation. The compiler's diagnostics are clear; fix in place.
- Tests using `act()` may need adjustments if the compiler short-circuits a render
  the test was relying on observing.
- The `eslint-plugin-react-compiler` rule should be added to `eslint.config.js` to
  surface compatibility issues at lint time before they break the build.

## Rollout sequence

1. **Now (this PR):** plugin installed, wiring complete, flag default OFF, runbook + env var documented.
2. **Sprint 1:** add `eslint-plugin-react-compiler` rules to lint pipeline; fix any reported
   violations.
3. **Sprint 1.5:** enable flag in dev/preview only (`VITE_REACT_COMPILER=1` in `.env.local`)
   for engineer dogfooding.
4. **Sprint 2 / Gate 1 hardening:** real-device QA pass per checklist; if green, flip in
   production via the deploy environment variable.
5. **Sprint 2+:** remove redundant `useMemo` / `useCallback` calls (the compiler handles
   them) — separate cleanup PR.

## Rollback

Set `VITE_REACT_COMPILER=` (empty) in the production environment and redeploy.
No source-code changes required — the wiring in `vite.config.ts` falls back to the
plain `react()` plugin when the flag is unset.
