/**
 * announcementsProgramAudienceVisibility.test.ts — FAMILIAS-9
 *
 * "Las novedades no funcionan": en cuanto el admin segmenta la audiencia por
 * PROGRAMA, la novedad desaparece del feed /novedades Y de la lista de gestión
 * /admin/novedades (ambas consumen el mismo `announcements.getAll`), de modo que
 * ni siquiera su autor puede volver a editarla o borrarla.
 *
 * Causa raíz: `getAll` resuelve los programas del usuario leyendo
 * `program_enrollments.person_id = ctx.user.id`, pero `ctx.user.id` es el UUID de
 * `auth.users` (server/_core/authenticateRequest.ts) y `program_enrollments.person_id`
 * referencia `persons.id`. Ninguna cuenta de personal tiene fila en `persons`, así
 * que `userProgramSlugs` es SIEMPRE []; con eso `programMatch` sólo puede ser cierto
 * cuando `rule.programs` está vacío. `getById` ya exceptuaba a admin/superadmin de
 * esa comprobación; `getAll` no.
 *
 * Estos tests llaman al resolver REAL vía createCaller con el cliente Supabase
 * mockeado (patrón de la casa, ver announcementAudienceProgramDrift.test.ts).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

interface FakeAudience {
  id: string;
  roles: string[];
  programs: string[];
}

interface FakeAnnouncementRow {
  id: string;
  titulo: string;
  announcement_audiences: FakeAudience[];
}

interface FakeResult {
  data: unknown;
  error: null;
}

// Mutable per-test fixtures. Read at CALL time by the builder below, never at
// vi.mock factory-eval time, so the hoisted factory does not trip on the TDZ.
let announcementRows: FakeAnnouncementRow[] = [];

function makeBuilder(table: string) {
  const result: FakeResult =
    table === "announcements"
      ? { data: announcementRows, error: null }
      : { data: [], error: null };

  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const method of ["select", "eq", "is", "in", "or", "order", "range", "limit"]) {
    builder[method] = chain;
  }
  builder.maybeSingle = () => Promise.resolve(result);
  builder.then = (onfulfilled: (value: FakeResult) => unknown) =>
    Promise.resolve(result).then(onfulfilled);
  return builder;
}

vi.mock("../../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => makeBuilder(table)),
  })),
}));

// Import AFTER vi.mock so the hoisted factory is already in place.
import { readsRouter } from "../announcements/reads";

/** Mismo cierre de roles que `User["role"]` (server/_core/authenticateRequest.ts). */
type AppRole = "user" | "admin" | "superadmin" | "voluntario" | "beneficiario";

function ctxFor(role: AppRole) {
  return {
    user: {
      // UUID de auth.users, igual que en producción (#144).
      id: "7f3a1c02-1111-4b2c-8d4e-99aa00bb11cc",
      openId: "7f3a1c02-1111-4b2c-8d4e-99aa00bb11cc",
      name: "Usuaria de prueba",
      email: "prueba@bocatas.org",
      role,
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
}

function announcement(id: string, audiences: Array<{ roles: string[]; programs: string[] }>) {
  return {
    id,
    titulo: `Novedad ${id}`,
    announcement_audiences: audiences.map((a, i) => ({ id: `${id}-aud-${i}`, ...a })),
  };
}

async function idsVisibleTo(role: AppRole): Promise<string[]> {
  const caller = readsRouter.createCaller(ctxFor(role));
  const res = await caller.getAll({});
  return (res.announcements as Array<{ id: string }>).map((a) => a.id);
}

beforeEach(() => {
  announcementRows = [];
});

describe("announcements.getAll — audiencia segmentada por programa (FAMILIAS-9)", () => {
  it("un admin ve en el feed la novedad que él mismo segmentó por programa", async () => {
    announcementRows = [announcement("seg", [{ roles: [], programs: ["comedor"] }])];
    await expect(idsVisibleTo("admin")).resolves.toEqual(["seg"]);
  });

  it("un superadmin también la ve (misma regla que getById)", async () => {
    announcementRows = [announcement("seg", [{ roles: [], programs: ["familia"] }])];
    await expect(idsVisibleTo("superadmin")).resolves.toEqual(["seg"]);
  });

  it("un admin ve también una novedad sin ninguna regla de audiencia (para poder repararla)", async () => {
    announcementRows = [announcement("huerfana", [])];
    await expect(idsVisibleTo("admin")).resolves.toEqual(["huerfana"]);
  });

  it("audiencia = todos sigue siendo visible para un voluntario (no regresión)", async () => {
    announcementRows = [announcement("todos", [{ roles: [], programs: [] }])];
    await expect(idsVisibleTo("voluntario")).resolves.toEqual(["todos"]);
  });

  it("la segmentación SÓLO por rol sigue funcionando para un voluntario (no regresión)", async () => {
    announcementRows = [
      announcement("solo-vol", [{ roles: ["voluntario"], programs: [] }]),
      announcement("solo-admin", [{ roles: ["admin"], programs: [] }]),
    ];
    await expect(idsVisibleTo("voluntario")).resolves.toEqual(["solo-vol"]);
  });

  it("[documenta lo BLOQUEADO] un voluntario sigue sin ver la novedad segmentada por programa: sin vínculo auth.users↔persons no hay inscripciones que consultar (gh #131 + migración JWT)", async () => {
    announcementRows = [announcement("seg", [{ roles: [], programs: ["comedor"] }])];
    await expect(idsVisibleTo("voluntario")).resolves.toEqual([]);
  });
});
