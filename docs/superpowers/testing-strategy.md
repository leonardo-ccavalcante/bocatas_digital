# Testing Strategy — Phase 2 + Phase 3

> Output of `/testing-strategy` for Stage S0 of the parallel-implementation plan
> ([read-the-file-users-familiagirardicavalc-cheerful-meerkat.md](../../../../.claude/plans/read-the-file-users-familiagirardicavalc-cheerful-meerkat.md)).
>
> Every Feature Agent in Stages S3 + S7 follows this contract.

---

## 1. Pyramid (target ratios per feature)

| Layer | Target share | Lives in | Hits real DB? |
|-------|-------------:|----------|---------------|
| Unit | **~60%** | `*.test.ts` colocated next to source, or `__tests__/` next-door | No — pure functions, in-process mocks |
| Integration | **~30%** | `server/__tests__/*.test.ts` for router + RLS + Zod parse round-trip | Yes — Supabase local instance via `supabase start` |
| E2E (Playwright) | **~10%** | `e2e/*.spec.ts` | Yes — gated by `E2E_LIVE=1` env var (off by default in CI fast path) |

**Why this split:** Unit tests run fastest (single-digit ms each) — keep most of the coverage there. Integration tests catch RLS + trigger + Zod-vs-DB drift that unit tests can't. E2E tests cover the funder-facing happy paths and the rare cross-tab interactions that unit/integration can't reach.

## 2. What gets mocked vs hits the real DB

### Mocks (unit layer)
- Pure transforms (Zod parses, CSV row → familia DTO, postal-code lookups, redaction helpers).
- React components rendered with mock query results (no live tRPC).
- XState machine transitions in isolation.

### Real DB / Supabase local (integration layer)
- **Every tRPC procedure under test:** the `caller` is wired to the actual router with a real Supabase admin client pointed at `supabase start`'s local DB.
- **RLS coverage tests:** read as superadmin / admin / voluntario / beneficiario, assert correct rows return.
- **Trigger tests:** insert a row, read it back, assert the trigger fired (e.g. `madrid_distrito_for` populated `distrito` from `codigo_postal`).
- **JSONB freeze test for derivar interventions:** insert, UPDATE the linked institución, re-read, assert the snapshot bytes are unchanged.

### Real browser (E2E layer, `E2E_LIVE=1`)
- The one journey per tab listed in the parallel plan §11 verification.
- Keyboard navigation + ARIA on Mapa choropleth (accessibility regression coverage).

## 3. Coverage baselines (lock — do not regress)

From `docs/execution-2026-05-06.md`:

| Metric | Floor |
|--------|------:|
| Lines | 25% |
| Branches | 70% |
| Functions | 40% |
| Statements | 25% |

These are conservatively set against the pre-Phase-2/3 state. Phase 2 + Phase 3 PRs should hold or improve all four. CI fails on regression.

## 4. Test-first RED list per Feature Agent

| Lane | First RED test (BEFORE production code) |
|------|----------------------------------------|
| Schema (M1) | `server/__tests__/madrid-distrito-drift.test.ts` — already RED on this branch; flips GREEN when M1 lands. |
| Schema (M2-M7) | Per-migration: Zod parse round-trip, RLS table read by role, trigger fires on insert. |
| server-mapa | `mapa.distritoStats.respects_k_anonymity_floor` (no distrito with `<3` families surfaces real counts). |
| server-reports | `customQuery.executor.refuses_unknown_entity_or_field` + per-template Zod parse. |
| server-instituciones | CRUD smoke + admin-only mutate guard. |
| server-derivar | `derivar.intervenciones.snapshot_freezes_on_insert` + LibreOffice subprocess sandbox check. |
| core-utils | `docxRender.placeholders_render_canonical_template` + `pdfFromDocx.libreoffice_smoke`. |
| client-mapa | Playwright keyboard-nav choropleth + ARIA tooltip + k-anon `<3` tooltip visible. |
| client-reports | `csv_export_redacts_high_risk_when_role_voluntario`. |
| client-derivar | Smart-prefill renders read-only badges for known fields, inputs for blanks. |
| client-instituciones | Admin-only route guard. |

## 5. Naming convention

Every test name encodes its assertion. Examples:
- ✓ `mapa.distritoStats.respects_k_anonymity_floor`
- ✓ `derivar.intervenciones.snapshot_freezes_on_insert`
- ✗ `should work` / `test 1` / `expect(true).toBe(false)` — anti-patterns. Fix on sight.

## 6. Commands

```bash
pnpm test                    # vitest run, full suite
pnpm test -- <pattern>        # filter by path
pnpm test --watch            # iterate during /tdd loop
E2E_LIVE=1 pnpm exec playwright test  # E2E (requires supabase start)
pnpm exec lhci autorun       # Lighthouse + bundle budget
node scripts/codemap-parity.mjs  # validate CODEMAP.md parity
```

## 7. Pre-existing test failures (excluded from Phase 2+3 regression bar)

19 tests on `main` currently fail due to missing `SUPABASE_URL` / `VITE_SUPABASE_URL` env vars in CI. These predate Phase 2+3 and are tracked separately. Phase 2+3 PRs are allowed to land as long as they don't extend the failing-test count.

---

*Output of `/testing-strategy` skill. Updated when test infrastructure changes.*
