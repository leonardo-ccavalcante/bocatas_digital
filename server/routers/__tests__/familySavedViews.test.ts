import { describe, it, expect, beforeEach, vi } from "vitest";
import { familySavedViewsRouter } from "../familySavedViews";
import type { TrpcContext } from "../../_core/context";
import type { User } from "../../../drizzle/schema";

// Capture insert calls so we can assert they reached Supabase with valid shape.
const insertCalls: Array<{ table: string; payload: unknown }> = [];

// Configurable delete result — tests set this before calling delete procedures.
let deleteResult: { data: { id: string }[] | null; error: { message: string } | null } = {
  data: [{ id: "a1b2c3d4-e5f6-4789-8abc-def012345678" }],
  error: null,
};

vi.mock("../../../client/src/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      insert: (payload: unknown) => ({
        select: () => ({
          single: async () => {
            insertCalls.push({ table, payload });
            return { data: { id: "test-uuid", ...(payload as object) }, error: null };
          },
        }),
      }),
      update: () => ({
        eq: () => ({
          eq: () => ({
            select: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      }),
      delete: () => ({
        eq: () => ({
          eq: () => ({
            select: async () => deleteResult,
          }),
        }),
      }),
      select: () => ({
        eq: () => ({
          or: () => ({
            order: () => ({
              order: async () => ({ data: [], error: null }),
            }),
          }),
        }),
      }),
    }),
  }),
}));

function buildUser(role: User["role"], id = 1): User {
  return {
    id,
    openId: `manus-${id}`,
    name: "Test User",
    email: "test@example.com",
    loginMethod: "manus",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  } as User;
}

function buildCtx(user: User | null): TrpcContext {
  return {
    req: {} as never,
    res: {} as never,
    user,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
    correlationId: "test-correlation-id",
  };
}

describe("familySavedViews router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertCalls.length = 0;
  });

  it("rejects voluntario from list", async () => {
    const caller = familySavedViewsRouter.createCaller(buildCtx(buildUser("voluntario")));
    await expect(caller.list({ programaId: "00000000-0000-0000-0000-000000000001" }))
      .rejects.toThrow(/FORBIDDEN|UNAUTHORIZED|admin|permission|10002/i);
  });

  it("rejects unauthenticated callers from list", async () => {
    const caller = familySavedViewsRouter.createCaller(buildCtx(null));
    await expect(caller.list({ programaId: "00000000-0000-0000-0000-000000000001" }))
      .rejects.toThrow(/FORBIDDEN|UNAUTHORIZED|permission|10002/i);
  });

  it("validates filters_json shape — rejects unknown keys", async () => {
    const caller = familySavedViewsRouter.createCaller(buildCtx(buildUser("admin")));
    await expect(caller.create({
      programaId: "00000000-0000-0000-0000-000000000001",
      nombre: "Activas",
      // @ts-expect-error — invalid shape on purpose
      filtersJson: { invalidField: 1 },
      isShared: false,
    })).rejects.toThrow();
  });

  it("create reaches Supabase with valid filters_json", async () => {
    insertCalls.length = 0;
    const caller = familySavedViewsRouter.createCaller(buildCtx(buildUser("admin")));
    const validProgramaId = "a1b2c3d4-e5f6-4789-8abc-def012345678";
    const result = await caller.create({
      programaId: validProgramaId,
      nombre: "Activas",
      filtersJson: { estado: "activa" },
      isShared: false,
    });
    expect(insertCalls.length).toBe(1);
    expect(insertCalls[0].table).toBe("family_saved_views");
    const payload = insertCalls[0].payload as Record<string, unknown>;
    expect(payload.user_id).toBe("1");
    expect(payload.programa_id).toBe(validProgramaId);
    expect(payload.nombre).toBe("Activas");
    expect(payload.filters_json).toEqual({ estado: "activa" });
    expect(payload.is_shared).toBe(false);
    expect(result).toMatchObject({ id: "test-uuid", nombre: "Activas" });
  });

  it("update requires id; rejects without it", async () => {
    const caller = familySavedViewsRouter.createCaller(buildCtx(buildUser("admin")));
    await expect(
      // @ts-expect-error — missing id on purpose
      caller.update({ nombre: "x" })
    ).rejects.toThrow();
  });

  it("delete returns success when one row is deleted", async () => {
    deleteResult = { data: [{ id: "a1b2c3d4-e5f6-4789-8abc-def012345678" }], error: null };
    const caller = familySavedViewsRouter.createCaller(buildCtx(buildUser("admin")));
    const result = await caller.delete({ id: "a1b2c3d4-e5f6-4789-8abc-def012345678" });
    expect(result).toEqual({ success: true });
  });

  it("delete throws NOT_FOUND when zero rows are matched (wrong owner or missing id)", async () => {
    deleteResult = { data: [], error: null };
    const caller = familySavedViewsRouter.createCaller(buildCtx(buildUser("admin")));
    await expect(
      caller.delete({ id: "a1b2c3d4-e5f6-4789-8abc-def012345678" })
    ).rejects.toThrow(/NOT_FOUND|no encontrada/i);
  });
});
