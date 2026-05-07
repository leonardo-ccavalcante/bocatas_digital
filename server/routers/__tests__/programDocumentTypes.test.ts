import { describe, it, expect, beforeEach, vi } from "vitest";
import type { TrpcContext } from "../../_core/context";
import type { User } from "../../../drizzle/schema";

// Capture interactions with the mocked Supabase client.
const insertCalls: Array<{ table: string; payload: unknown }> = [];
const updateCalls: Array<{ table: string; payload: unknown; eqArgs: unknown[] }> = [];
const signedUrlCalls: Array<{ bucket: string; path: string; expiresIn: number }> = [];

let listProgramId: string | null = null;
// Track whether the is_active filter was applied during list
let listIsActiveFilterApplied = false;
let listSlugLookupReturns: { data: { id: string } | null; error: null | { message: string } } = {
  data: { id: "550e8400-e29b-41d4-a716-446655440001" },
  error: null,
};
let listResult: { data: unknown[]; error: null | { message: string } } = { data: [], error: null };

vi.mock("../../../client/src/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "programs") {
        // Used by crud.list when programaSlug is provided
        return {
          select: () => ({
            eq: () => ({
              single: async () => listSlugLookupReturns,
            }),
          }),
        };
      }
      if (table === "program_document_types") {
        return {
          select: () => ({
            eq: (col: string, val: unknown) => {
              if (col === "programa_id") listProgramId = String(val);
              // Track is_active filter
              if (col === "is_active") listIsActiveFilterApplied = true;
              return {
                eq: (col2: string) => {
                  if (col2 === "is_active") listIsActiveFilterApplied = true;
                  return {
                    order: async () => listResult,
                  };
                },
                order: async () => listResult,
              };
            },
          }),
          insert: (payload: unknown) => ({
            select: () => ({
              single: async () => {
                insertCalls.push({ table, payload });
                return { data: { id: "a1b2c3d4-e5f6-4789-8abc-def012345678", ...(payload as object) }, error: null };
              },
            }),
          }),
          update: (payload: unknown) => ({
            eq: (col1: string, val1: unknown) => ({
              select: () => ({
                single: async () => {
                  updateCalls.push({ table, payload, eqArgs: [col1, val1] });
                  return { data: { id: String(val1), ...(payload as object) }, error: null };
                },
              }),
            }),
          }),
        };
      }
      return {} as never;
    },
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (path: string, expiresIn: number) => {
          signedUrlCalls.push({ bucket, path, expiresIn });
          return { data: { signedUrl: `https://example.com/${bucket}/${path}?signed=true` }, error: null };
        },
      }),
    },
  }),
}));

import { programDocumentTypesRouter } from "../programDocumentTypes";

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
    correlationId: "t",
  };
}

describe("programDocumentTypes router", () => {
  beforeEach(() => {
    insertCalls.length = 0;
    updateCalls.length = 0;
    signedUrlCalls.length = 0;
    listProgramId = null;
    listIsActiveFilterApplied = false;
    listSlugLookupReturns = { data: { id: "550e8400-e29b-41d4-a716-446655440001" }, error: null };
    listResult = { data: [], error: null };
    vi.clearAllMocks();
  });

  describe("crud", () => {
    it("list (with programaId) reaches DB scoped to active rows ordered by display_order", async () => {
      const caller = programDocumentTypesRouter.createCaller(buildCtx(buildUser("voluntario")));
      listResult = { data: [{ id: "t1", slug: "padron_municipal", nombre: "Padrón municipal" }], error: null };
      const rows = await caller.list({ programaId: "550e8400-e29b-41d4-a716-446655440001" });
      expect(rows).toHaveLength(1);
      expect(listProgramId).toBe("550e8400-e29b-41d4-a716-446655440001");
    });

    it("list (with programaSlug) resolves the program first, then returns rows", async () => {
      const caller = programDocumentTypesRouter.createCaller(buildCtx(buildUser("voluntario")));
      listSlugLookupReturns = { data: { id: "550e8400-e29b-41d4-a716-446655440001" }, error: null };
      listResult = { data: [{ id: "t1" }], error: null };
      const rows = await caller.list({ programaSlug: "programa_familias" });
      expect(rows).toHaveLength(1);
      expect(listProgramId).toBe("550e8400-e29b-41d4-a716-446655440001");
    });

    it("list throws NOT_FOUND when programaSlug is unknown", async () => {
      const caller = programDocumentTypesRouter.createCaller(buildCtx(buildUser("voluntario")));
      listSlugLookupReturns = { data: null, error: null };
      await expect(caller.list({ programaSlug: "no_existe" })).rejects.toThrow(/NOT_FOUND|no encontr/i);
    });

    it("list rejects unauthenticated callers", async () => {
      const caller = programDocumentTypesRouter.createCaller(buildCtx(null));
      await expect(caller.list({ programaSlug: "programa_familias" })).rejects.toThrow(/UNAUTHORIZED|login|10001/i);
    });

    it("list rejects when neither programaId nor programaSlug is given", async () => {
      const caller = programDocumentTypesRouter.createCaller(buildCtx(buildUser("admin")));
      // Both programaId and programaSlug are undefined — refine rejects at runtime
      await expect(caller.list({})).rejects.toThrow();
    });

    it("list defaults to active-only rows when includeInactive is omitted", async () => {
      const caller = programDocumentTypesRouter.createCaller(buildCtx(buildUser("voluntario")));
      listResult = { data: [{ id: "t1", slug: "padron", nombre: "Padrón", is_active: true }], error: null };
      await caller.list({ programaId: "550e8400-e29b-41d4-a716-446655440001" });
      expect(listIsActiveFilterApplied).toBe(true);
    });

    it("list returns inactive rows when includeInactive=true", async () => {
      const caller = programDocumentTypesRouter.createCaller(buildCtx(buildUser("voluntario")));
      listResult = {
        data: [
          { id: "t1", slug: "padron", nombre: "Padrón", is_active: true },
          { id: "t2", slug: "informe", nombre: "Informe", is_active: false },
        ],
        error: null,
      };
      const rows = await caller.list({ programaId: "550e8400-e29b-41d4-a716-446655440001", includeInactive: true });
      expect(listIsActiveFilterApplied).toBe(false);
      expect(rows).toHaveLength(2);
    });

    it("create rejects non-superadmin (admin)", async () => {
      const caller = programDocumentTypesRouter.createCaller(buildCtx(buildUser("admin")));
      await expect(caller.create({
        programaId: "550e8400-e29b-41d4-a716-446655440001",
        slug: "test_type",
        nombre: "Test type",
        scope: "familia",
      })).rejects.toThrow(/FORBIDDEN|UNAUTHORIZED|permission|10002|Superadmin/i);
    });

    it("create succeeds for superadmin and reaches DB with sanitized payload", async () => {
      const caller = programDocumentTypesRouter.createCaller(buildCtx(buildUser("superadmin")));
      const result = await caller.create({
        programaId: "550e8400-e29b-41d4-a716-446655440001",
        slug: "renovacion_padron",
        nombre: "Renovación de padrón",
        descripcion: "Documento solicitado anualmente",
        scope: "familia",
        isRequired: true,
        displayOrder: 80,
      });
      expect(insertCalls).toHaveLength(1);
      const payload = insertCalls[0].payload as Record<string, unknown>;
      expect(payload.programa_id).toBe("550e8400-e29b-41d4-a716-446655440001");
      expect(payload.slug).toBe("renovacion_padron");
      expect(payload.nombre).toBe("Renovación de padrón");
      expect(payload.descripcion).toBe("Documento solicitado anualmente");
      expect(payload.scope).toBe("familia");
      expect(payload.is_required).toBe(true);
      expect(payload.display_order).toBe(80);
      expect(result).toMatchObject({ id: "a1b2c3d4-e5f6-4789-8abc-def012345678", slug: "renovacion_padron" });
    });

    it("create rejects invalid slug (non snake_case)", async () => {
      const caller = programDocumentTypesRouter.createCaller(buildCtx(buildUser("superadmin")));
      await expect(caller.create({
        programaId: "550e8400-e29b-41d4-a716-446655440001",
        slug: "Bad Slug!",
        nombre: "X",
        scope: "familia",
      })).rejects.toThrow();
    });

    it("create rejects invalid scope", async () => {
      const caller = programDocumentTypesRouter.createCaller(buildCtx(buildUser("superadmin")));
      await expect(caller.create({
        programaId: "550e8400-e29b-41d4-a716-446655440001",
        slug: "x",
        nombre: "X",
        // @ts-expect-error - invalid scope
        scope: "wrong",
      })).rejects.toThrow();
    });

    it("update rejects non-superadmin (admin)", async () => {
      const caller = programDocumentTypesRouter.createCaller(buildCtx(buildUser("admin")));
      await expect(caller.update({
        id: "a1b2c3d4-e5f6-4789-8abc-def012345678",
        nombre: "Renamed",
      })).rejects.toThrow(/FORBIDDEN|UNAUTHORIZED|permission|10002|Superadmin/i);
    });

    it("update succeeds for superadmin and only sets defined fields", async () => {
      const caller = programDocumentTypesRouter.createCaller(buildCtx(buildUser("superadmin")));
      await caller.update({
        id: "a1b2c3d4-e5f6-4789-8abc-def012345678",
        nombre: "Renamed",
        isActive: false,
      });
      expect(updateCalls).toHaveLength(1);
      const payload = updateCalls[0].payload as Record<string, unknown>;
      expect(payload.nombre).toBe("Renamed");
      expect(payload.is_active).toBe(false);
      // descripcion / is_required / display_order should NOT be in the payload (undefined inputs)
      expect(payload).not.toHaveProperty("descripcion");
      expect(payload).not.toHaveProperty("is_required");
      expect(payload).not.toHaveProperty("display_order");
      expect(payload.updated_at).toEqual(expect.any(String));
    });
  });

  describe("templates", () => {
    it("signedUrl is callable by any authenticated user", async () => {
      const caller = programDocumentTypesRouter.createCaller(buildCtx(buildUser("voluntario")));
      const result = await caller.signedUrl({
        path: "templates/padron_v1.docx",
      });
      expect(signedUrlCalls).toHaveLength(1);
      expect(signedUrlCalls[0].bucket).toBe("program-document-templates");
      expect(signedUrlCalls[0].path).toBe("templates/padron_v1.docx");
      expect(signedUrlCalls[0].expiresIn).toBe(3600);
      expect(result.signedUrl).toContain("signed=true");
    });

    it("signedUrl rejects unauthenticated callers", async () => {
      const caller = programDocumentTypesRouter.createCaller(buildCtx(null));
      await expect(caller.signedUrl({ path: "x" })).rejects.toThrow(/UNAUTHORIZED|login|10001/i);
    });

    it("registerUpload rejects non-superadmin (admin)", async () => {
      const caller = programDocumentTypesRouter.createCaller(buildCtx(buildUser("admin")));
      await expect(caller.registerUpload({
        docTypeId: "a1b2c3d4-e5f6-4789-8abc-def012345678",
        kind: "template",
        path: "templates/x.docx",
        filename: "x.docx",
        version: "v1",
      })).rejects.toThrow(/FORBIDDEN|UNAUTHORIZED|permission|10002|Superadmin/i);
    });

    it("registerUpload (template kind) updates the right columns and reaches DB", async () => {
      const caller = programDocumentTypesRouter.createCaller(buildCtx(buildUser("superadmin")));
      await caller.registerUpload({
        docTypeId: "a1b2c3d4-e5f6-4789-8abc-def012345678",
        kind: "template",
        path: "templates/padron_v3.docx",
        filename: "padron_v3.docx",
        version: "v3",
      });
      expect(updateCalls).toHaveLength(1);
      const payload = updateCalls[0].payload as Record<string, unknown>;
      expect(payload.template_url).toBe("templates/padron_v3.docx");
      expect(payload.template_filename).toBe("padron_v3.docx");
      expect(payload.template_version).toBe("v3");
      expect(payload).not.toHaveProperty("guide_url");
    });

    it("registerUpload (guide kind) updates the right columns", async () => {
      const caller = programDocumentTypesRouter.createCaller(buildCtx(buildUser("superadmin")));
      await caller.registerUpload({
        docTypeId: "a1b2c3d4-e5f6-4789-8abc-def012345678",
        kind: "guide",
        path: "guides/padron.pdf",
        filename: "padron.pdf",
        version: "v1",
      });
      expect(updateCalls).toHaveLength(1);
      const payload = updateCalls[0].payload as Record<string, unknown>;
      expect(payload.guide_url).toBe("guides/padron.pdf");
      expect(payload.guide_filename).toBe("padron.pdf");
      expect(payload.guide_version).toBe("v1");
      expect(payload).not.toHaveProperty("template_url");
    });
  });
});
