/**
 * announcementAudienceProgramDrift.test.ts
 *
 * MYTHOS: MYT-131
 *
 * ANNOUNCEMENT_PROGRAMS (shared/announcementTypes.ts:60-67) is a hardcoded
 * 6-literal list — duplicated verbatim inside the REAL router's
 * AudienceRuleSchema (server/routers/announcements/_shared.ts:31-40) instead
 * of being read from the dynamic `programs` catalog table (tree feature,
 * #130). Two concrete, present-day consequences, both verified against
 * migrations in this HEAD:
 *
 * 1. Migration 20260507000002_rename_familia_slug_to_programa_familias.sql
 *    renamed programs.slug 'familia' -> 'programa_familias' months ago (also
 *    referenced by 20260506210007, 20260601000007, 20260723100001 as the
 *    live Programa de Familia slug). The hardcoded list was never updated:
 *    it still has the DEAD slug 'familia' and is MISSING the real current
 *    slug 'programa_familias'. Announcements can never target the real
 *    Family program by audience filter.
 * 2. `programs.slug` is free-form (server/routers/programs.ts `slugSchema`,
 *    format-only regex `^[a-z0-9_]+$`), so any program created through the
 *    admin UI after the initial 6 seed rows — e.g. an "edición" like
 *    `cocina_enero_2026` (ADR-0013 program-tree editions carry a year) — is
 *    a perfectly valid programs.slug but is REJECTED as an audience target.
 *
 * These tests call the REAL `create` mutation via appRouter.createCaller
 * (never a mocked resolver) — the rejection happens at tRPC input-parsing
 * time, before the (mocked) DB is ever touched.
 */
import { describe, it, expect, vi } from "vitest";
import { TRPCError } from "@trpc/server";

// ─── Module-level mock: createAdminClient. The defect under test fires
// during input parsing, before the resolver body runs, so this stub is only
// exercised by the "should succeed" assertions — it mirrors the house
// pattern so the module import never depends on real Supabase env vars. ────
vi.mock("../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: () => ({
        select: () => ({
          single: async () => ({
            data: {
              id: "550e8400-e29b-41d4-a716-446655440099",
              titulo: "x",
              contenido: "y",
              tipo: "info",
              es_urgente: false,
              fecha_inicio: null,
              fecha_fin: null,
              fijado: false,
              imagen_url: null,
              autor_id: "1",
              autor_nombre: "Test Admin",
              activo: true,
            },
            error: null,
          }),
        }),
      }),
    })),
  })),
}));

// Import AFTER vi.mock so the hoisted factory is in place.
import { crudRouter } from "../routers/announcements/crud";

const ADMIN_CTX = {
  user: {
    id: 1,
    openId: "test-open-id",
    name: "Test Admin",
    email: "admin@bocatas.org",
    role: "admin" as const,
    loginMethod: "test",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  },
  req: {} as never,
  res: {} as never,
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } as never,
  correlationId: "test-correlation-id",
};

function createWithProgram(program: string) {
  const caller = crudRouter.createCaller(ADMIN_CTX);
  return caller.create({
    titulo: "Cambio de horario",
    contenido: "Aviso para el programa afectado.",
    audiences: [{ roles: [], programs: [program as never] }],
  });
}

// ─── DEFERRED (gh #131) — these two assertions are the RED evidence, kept as
// `it.skip` executable spec rather than force-passed. Un-skip them as part of
// the REAL fix, which is a SCHEMA MIGRATION, not a Zod-only change:
//
//   `announcement_audiences.programs` is a Postgres `programa[]` ENUM column
//   (supabase/migrations/20260501000002_announcement_audiences_table.sql:8),
//   never converted to text — unlike `attendances.programa`
//   (20260520000001). The `programa` enum has the DEAD slug 'familia' and
//   lacks 'programa_familias' and any UI-created slug. So a format-only Zod
//   change would make THIS mocked test pass while the real INSERT still 42804s
//   at runtime — a false green (the module-level DB mock hides the enum check).
//
//   Real fix = migrate the column `programa[]` → `text[]` (+ FK/validation to
//   `programs.slug`, mirroring attendances) + backfill 'familia'→'programa_familias'
//   + regen database.types.ts + replace the hardcoded enum in
//   `_shared.ts`/`useAudienceOptions.ts`/`AdminNovedades/_shared.ts` with the
//   dynamic catalog. Needs a local Supabase stack for type-regen and a prod
//   schema apply — tracked on #131. See the warning block in
//   shared/announcementTypes.ts.
describe("announcements.create — audience program drift (MYT-131)", () => {
  it.skip("accepts 'programa_familias' — the REAL, current Programa de Familia slug (renamed from 'familia' by migration 20260507000002, still live per 20260723100001) [un-skip after the announcement_audiences enum→text migration]", async () => {
    await expect(createWithProgram("programa_familias")).resolves.toBeDefined();
  });

  it.skip("accepts a dynamically-created program slug (e.g. 'cocina_enero_2026', a valid programs.slug per the tree feature's format-only regex) [un-skip after the announcement_audiences enum→text migration]", async () => {
    await expect(createWithProgram("cocina_enero_2026")).resolves.toBeDefined();
  });

  // NOTE: this assertion already PASSES today (not RED) — it documents the
  // reverse half of the same drift for the fixer, it is not itself failing
  // evidence. The two tests above are the RED evidence for MYT-131.
  it("[documents current behavior] silently accepts the dead pre-rename slug 'familia' as if it still mapped to a real program", async () => {
    // 'familia' is accepted today by the stale hardcoded enum even though no
    // programs row has had that slug since the 20260507000002 rename. A
    // dynamic-catalog fix must flip this to a rejection (or an explicit
    // read-time tolerance for historical announcements only, per the
    // fix_hint) — whoever fixes MYT-131 should expect this assertion to
    // invert and update it accordingly.
    let caught: unknown;
    try {
      await createWithProgram("familia");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeUndefined();
  });
});
