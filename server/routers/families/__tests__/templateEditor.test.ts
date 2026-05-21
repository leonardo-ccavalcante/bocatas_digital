/**
 * templateEditor.test.ts — families.publishTemplate / listTemplateVersions
 *
 * Uses the chainable-Supabase mock idiom from followUps.test.ts:
 * createAdminClient is replaced by a factory returning { from: fromMock },
 * and each test installs a chain that resolves the expected shape.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

import type { TrpcContext } from "../../../_core/context";
import { Logger } from "../../../_core/logger";

// ─── vi.mock — must precede router import ─────────────────────────────────
const fromMock = vi.fn();

vi.mock("../../../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({ from: fromMock })),
  createServerClient: vi.fn(),
}));

// Import AFTER vi.mock is registered.
import { templateEditorRouter } from "../template-editor";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function ctxWithRole(role: AuthenticatedUser["role"]): TrpcContext {
  const user: AuthenticatedUser = {
    id: 99,
    openId: "test-user",
    email: `${role}@bocatas.org`,
    name: role,
    loginMethod: "manus",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    logger: new Logger(),
    correlationId: "template-editor-test",
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const VALID_INPUT = {
  slug: "informe_social" as const,
  nombre: "Informe Social v3",
  storage_path: "templates/informe_social_v3.docx",
  logos: [],
  static_blocks: {},
  placeholders: ["nombre_completo", "fecha"],
};

beforeEach(() => {
  fromMock.mockReset();
});

// ─── RBAC gate ─────────────────────────────────────────────────────────────

describe("families.publishTemplate — RBAC", () => {
  it("throws FORBIDDEN when called by an admin (non-superadmin)", async () => {
    // superadminProcedure checks ctx.user.role !== 'superadmin' and throws FORBIDDEN
    const caller = templateEditorRouter.createCaller(ctxWithRole("admin"));
    await expect(caller.publishTemplate(VALID_INPUT)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("throws FORBIDDEN when called by a voluntario", async () => {
    const caller = templateEditorRouter.createCaller(ctxWithRole("voluntario"));
    await expect(caller.publishTemplate(VALID_INPUT)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("families.listTemplateVersions — RBAC", () => {
  it("throws FORBIDDEN when called by an admin (non-superadmin)", async () => {
    const caller = templateEditorRouter.createCaller(ctxWithRole("admin"));
    await expect(
      caller.listTemplateVersions({ slug: "informe_social" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ─── publishTemplate (superadmin) ─────────────────────────────────────────

describe("families.publishTemplate — superadmin publish flow", () => {
  it("increments version and deactivates previous active row", async () => {
    const existingRow = { id: "aaa", version: 2 };
    const insertedRow = {
      id: "bbb",
      slug: "informe_social",
      version: 3,
      is_active: true,
    };

    // Chain for maybeSingle (find max version)
    const maybeSingleChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(() =>
        Promise.resolve({ data: existingRow, error: null })
      ),
    };

    // updateSpy to track the deactivation call
    const updateSpy = vi.fn().mockReturnThis();
    // Chain for update (deactivate old row)
    const updateChain = {
      update: updateSpy,
      eq: vi.fn().mockReturnThis(),
    };

    // insertSpy to track the insert call
    const insertSpy = vi.fn().mockReturnThis();
    // Chain for insert (new version)
    const insertChain = {
      insert: insertSpy,
      select: vi.fn().mockReturnThis(),
      single: vi.fn(() =>
        Promise.resolve({ data: insertedRow, error: null })
      ),
    };

    // fromMock returns chains in order of calls
    fromMock
      .mockReturnValueOnce(maybeSingleChain) // call 1: select existing
      .mockReturnValueOnce({
        // call 2: update deactivation
        update: updateSpy,
        eq: vi.fn().mockReturnThis(),
      })
      .mockReturnValueOnce(insertChain); // call 3: insert new

    const caller = templateEditorRouter.createCaller(
      ctxWithRole("superadmin")
    );
    const result = await caller.publishTemplate(VALID_INPUT);

    // New row inserted with version: 3 and is_active: true
    expect(result.version).toBe(3);
    expect(result.is_active).toBe(true);

    // update was called to deactivate the old active row
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ is_active: false, updated_by: "99" })
    );

    // insert was called with the correct payload
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "informe_social",
        version: 3,
        is_active: true,
        created_by: "99",
      })
    );
  });

  it("sets version to 1 when no prior rows exist (first publish)", async () => {
    // No existing row
    const maybeSingleChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(() =>
        Promise.resolve({ data: null, error: null })
      ),
    };

    const insertedRow = {
      id: "ccc",
      slug: "nota_entrega",
      version: 1,
      is_active: true,
    };
    const insertSpy = vi.fn().mockReturnThis();
    const insertChain = {
      insert: insertSpy,
      select: vi.fn().mockReturnThis(),
      single: vi.fn(() =>
        Promise.resolve({ data: insertedRow, error: null })
      ),
    };

    // No update call should happen — only 2 `from` calls
    fromMock
      .mockReturnValueOnce(maybeSingleChain)
      .mockReturnValueOnce(insertChain);

    const caller = templateEditorRouter.createCaller(
      ctxWithRole("superadmin")
    );
    const result = await caller.publishTemplate({
      ...VALID_INPUT,
      slug: "nota_entrega",
    });

    expect(result.version).toBe(1);
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ version: 1, is_active: true })
    );
  });

  it("throws INTERNAL_SERVER_ERROR when insert fails", async () => {
    const maybeSingleChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(() =>
        Promise.resolve({ data: null, error: null })
      ),
    };

    const insertChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn(() =>
        Promise.resolve({ data: null, error: { message: "insert failed" } })
      ),
    };

    fromMock
      .mockReturnValueOnce(maybeSingleChain)
      .mockReturnValueOnce(insertChain);

    const caller = templateEditorRouter.createCaller(
      ctxWithRole("superadmin")
    );
    await expect(caller.publishTemplate(VALID_INPUT)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
  });
});

// ─── listTemplateVersions (superadmin) ────────────────────────────────────

describe("families.listTemplateVersions", () => {
  it("returns rows ordered by version desc", async () => {
    const rows = [
      {
        id: "v3",
        slug: "informe_social",
        nombre: "v3",
        version: 3,
        is_active: true,
        created_by: "99",
        created_at: "2026-05-21T00:00:00Z",
      },
      {
        id: "v2",
        slug: "informe_social",
        nombre: "v2",
        version: 2,
        is_active: false,
        created_by: "99",
        created_at: "2026-05-20T00:00:00Z",
      },
    ];

    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn(() => Promise.resolve({ data: rows, error: null })),
    };
    fromMock.mockReturnValueOnce(chain);

    const caller = templateEditorRouter.createCaller(
      ctxWithRole("superadmin")
    );
    const result = await caller.listTemplateVersions({
      slug: "informe_social",
    });

    expect(result).toHaveLength(2);
    expect(result[0].version).toBe(3);
    expect(result[1].version).toBe(2);
  });

  it("returns empty array when no versions exist", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn(() => Promise.resolve({ data: null, error: null })),
    };
    fromMock.mockReturnValueOnce(chain);

    const caller = templateEditorRouter.createCaller(
      ctxWithRole("superadmin")
    );
    const result = await caller.listTemplateVersions({ slug: "derivacion" });

    expect(result).toEqual([]);
  });

  it("throws INTERNAL_SERVER_ERROR on query error", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn(() =>
        Promise.resolve({ data: null, error: { message: "query error" } })
      ),
    };
    fromMock.mockReturnValueOnce(chain);

    const caller = templateEditorRouter.createCaller(
      ctxWithRole("superadmin")
    );
    await expect(
      caller.listTemplateVersions({ slug: "informe_social" })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});
