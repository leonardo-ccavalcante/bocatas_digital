import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TrpcContext } from "../../_core/context";
import type { User } from "../../../drizzle/schema";

// Capture supabase interactions for assertions.
let capturedListFilters: Record<string, unknown> = {};
let listResult: { data: unknown[]; error: { message: string } | null; count: number | null } = {
  data: [],
  error: null,
  count: 0,
};
let updateResult: { data: unknown; error: { message: string } | null } = { data: null, error: null };
let updateCallArgs: { table: string; payload: Record<string, unknown>; eqArgs: Array<[string, unknown]> } | null = null;

vi.mock("../../../client/src/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "family_member_documents") {
        return {
          select: () => ({
            eq: (col: string, val: unknown) => {
              capturedListFilters[col] = val;
              return {
                eq: (col2: string, val2: unknown) => {
                  capturedListFilters[col2] = val2;
                  return {
                    is: (col3: string, val3: unknown) => {
                      capturedListFilters[col3] = val3;
                      return {
                        order: () => ({
                          range: async () => listResult,
                        }),
                      };
                    },
                  };
                },
                is: (col2: string, val2: unknown) => {
                  capturedListFilters[col2] = val2;
                  return {
                    order: () => ({
                      range: async () => listResult,
                    }),
                  };
                },
              };
            },
            is: (col: string, val: unknown) => {
              capturedListFilters[col] = val;
              return {
                eq: (col2: string, val2: unknown) => {
                  capturedListFilters[col2] = val2;
                  return {
                    order: () => ({
                      range: async () => listResult,
                    }),
                  };
                },
                order: () => ({
                  range: async () => listResult,
                }),
              };
            },
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: (col1: string, val1: unknown) => ({
              select: () => ({
                maybeSingle: async () => {
                  updateCallArgs = { table, payload, eqArgs: [[col1, val1]] };
                  return updateResult;
                },
              }),
            }),
          }),
        };
      }
      return {} as never;
    },
  }),
}));

import { familiesRouter } from "../families";

function buildUser(role: User["role"], id = 1): User {
  return {
    id,
    openId: `manus-${id}`,
    name: "Test",
    email: "t@example.com",
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
    correlationId: "t",
  };
}

describe("families.listAllForProgram", () => {
  beforeEach(() => {
    capturedListFilters = {};
    listResult = { data: [], error: null, count: 0 };
    vi.clearAllMocks();
  });

  it("rejects voluntario caller with FORBIDDEN", async () => {
    const caller = familiesRouter.createCaller(buildCtx(buildUser("voluntario")));
    await expect(caller.listAllForProgram({ limit: 10, offset: 0 } as never))
      .rejects.toThrow(/FORBIDDEN|UNAUTHORIZED|admin|permission|10002/i);
  });

  it("rejects unauthenticated caller", async () => {
    const caller = familiesRouter.createCaller(buildCtx(null));
    // adminProcedure throws FORBIDDEN (10002) for null users — same as non-admin callers.
    await expect(caller.listAllForProgram({ limit: 10, offset: 0 } as never))
      .rejects.toThrow(/UNAUTHORIZED|FORBIDDEN|permission|10002/i);
  });

  it("admin caller can list with no filters and gets default pagination", async () => {
    const caller = familiesRouter.createCaller(buildCtx(buildUser("admin")));
    listResult = { data: [{ id: "d1" }], error: null, count: 1 };
    const result = await caller.listAllForProgram({});
    expect(result).toEqual({ rows: [{ id: "d1" }], total: 1 });
  });

  it("filters by is_current=true and deleted_at IS NULL by default", async () => {
    const caller = familiesRouter.createCaller(buildCtx(buildUser("admin")));
    await caller.listAllForProgram({});
    expect(capturedListFilters.is_current).toBe(true);
    expect(capturedListFilters.deleted_at).toBe(null);
  });

  it("applies tipoSlug filter when provided", async () => {
    const caller = familiesRouter.createCaller(buildCtx(buildUser("admin")));
    await caller.listAllForProgram({ tipoSlug: "padron_municipal" });
    expect(capturedListFilters.documento_tipo).toBe("padron_municipal");
  });

  it("applies familyId filter when provided", async () => {
    const caller = familiesRouter.createCaller(buildCtx(buildUser("admin")));
    const fid = "550e8400-e29b-41d4-a716-446655440001";
    await caller.listAllForProgram({ familyId: fid });
    expect(capturedListFilters.family_id).toBe(fid);
  });

  it("rejects invalid tipoSlug (not in familyDocTypeSchema)", async () => {
    const caller = familiesRouter.createCaller(buildCtx(buildUser("admin")));
    await expect(caller.listAllForProgram({ tipoSlug: "evil_type" as never }))
      .rejects.toThrow();
  });

  it("rejects limit > 500", async () => {
    const caller = familiesRouter.createCaller(buildCtx(buildUser("admin")));
    await expect(caller.listAllForProgram({ limit: 9999 } as never))
      .rejects.toThrow();
  });

  it("rejects negative offset", async () => {
    const caller = familiesRouter.createCaller(buildCtx(buildUser("admin")));
    await expect(caller.listAllForProgram({ offset: -1 } as never))
      .rejects.toThrow();
  });
});

describe("families.classifyDocument", () => {
  beforeEach(() => {
    updateCallArgs = null;
    updateResult = { data: null, error: null };
    vi.clearAllMocks();
  });

  it("rejects voluntario", async () => {
    const caller = familiesRouter.createCaller(buildCtx(buildUser("voluntario")));
    await expect(caller.classifyDocument({
      docId: "550e8400-e29b-41d4-a716-446655440001",
      documentoTipo: "padron_municipal",
    })).rejects.toThrow(/FORBIDDEN|UNAUTHORIZED|admin|permission|10002/i);
  });

  it("rejects invalid documentoTipo", async () => {
    const caller = familiesRouter.createCaller(buildCtx(buildUser("admin")));
    await expect(caller.classifyDocument({
      docId: "550e8400-e29b-41d4-a716-446655440001",
      documentoTipo: "garbage" as never,
    })).rejects.toThrow();
  });

  it("rejects non-uuid docId", async () => {
    const caller = familiesRouter.createCaller(buildCtx(buildUser("admin")));
    await expect(caller.classifyDocument({
      docId: "not-a-uuid",
      documentoTipo: "padron_municipal",
    })).rejects.toThrow();
  });

  it("admin can classify and reaches the DB with the right payload", async () => {
    const caller = familiesRouter.createCaller(buildCtx(buildUser("admin")));
    const docId = "a1b2c3d4-e5f6-4789-8abc-def012345678";
    updateResult = { data: { id: docId, documento_tipo: "padron_municipal" }, error: null };
    const result = await caller.classifyDocument({ docId, documentoTipo: "padron_municipal" });
    expect(updateCallArgs?.table).toBe("family_member_documents");
    expect(updateCallArgs?.payload.documento_tipo).toBe("padron_municipal");
    expect(updateCallArgs?.eqArgs[0]).toEqual(["id", docId]);
    expect(result).toMatchObject({ id: docId, documento_tipo: "padron_municipal" });
  });

  it("throws NOT_FOUND when no row matches", async () => {
    const caller = familiesRouter.createCaller(buildCtx(buildUser("admin")));
    updateResult = { data: null, error: null };
    await expect(caller.classifyDocument({
      docId: "a1b2c3d4-e5f6-4789-8abc-def012345678",
      documentoTipo: "padron_municipal",
    })).rejects.toThrow(/NOT_FOUND|no encontrado/i);
  });

  it("propagates supabase errors as INTERNAL_SERVER_ERROR", async () => {
    const caller = familiesRouter.createCaller(buildCtx(buildUser("admin")));
    updateResult = { data: null, error: { message: "DB exploded" } };
    await expect(caller.classifyDocument({
      docId: "a1b2c3d4-e5f6-4789-8abc-def012345678",
      documentoTipo: "padron_municipal",
    })).rejects.toThrow(/DB exploded|INTERNAL_SERVER_ERROR/i);
  });
});
