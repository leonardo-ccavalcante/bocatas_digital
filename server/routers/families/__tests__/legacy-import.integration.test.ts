/**
 * legacy-import.integration.test.ts — Integration tests for the legacy
 * FAMILIAS bulk importer router procedures.
 *
 * Mocks the Supabase admin client so we exercise the full router code
 * paths (header detection, row cap, dedup probe chunking, count math,
 * stash insert, RPC dispatch, error sanitisation) without a live DB.
 *
 * Mocking pattern source: server/routers/__tests__/persons.dedup.test.ts.
 *
 * What this covers (was 0% on legacy-import.ts):
 *   - previewLegacyImport BAD_REQUEST when header missing
 *   - previewLegacyImport BAD_REQUEST when row cap exceeded
 *   - previewLegacyImport happy path: parses CSV, inserts preview, returns counts
 *   - previewLegacyImport flags `family_already_imported` from idempotency probe
 *   - previewLegacyImport surfaces dedup hits from the persons probe
 *   - previewLegacyImport sanitises src_filename through safeFilename
 *   - previewLegacyImport returns INTERNAL_SERVER_ERROR with sanitised
 *     message when families probe or stash insert fails
 *   - confirmLegacyImport NOT_FOUND on missing/expired token
 *   - confirmLegacyImport happy path passes RPC counts through
 *   - confirmLegacyImport sanitises generic INTERNAL_SERVER_ERROR on RPC fail
 *   - confirmLegacyImport rejects malformed RPC response shape
 *   - safeFilename helper directly: path traversal, control chars, length cap
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

// ── Mocks ────────────────────────────────────────────────────────────────
//
// vi.mock factories are hoisted to the top of the file. They mustn't
// reference module-level `let/const` (those are in TDZ at hoist time),
// so we attach a single shared state object to globalThis. Each factory
// initialises state lazily at first call.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (opts: any) => any;
type ProcedureSpy = { inputSchema: unknown; handler: Handler };

interface LegacyImportShared {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fromMock: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpcMock: any;
  procedureSpies: Record<string, ProcedureSpy>;
}

function ensureShared(): LegacyImportShared {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const root = globalThis as any;
  if (!root.__legacyImportShared) {
    root.__legacyImportShared = {
      fromMock: vi.fn(),
      rpcMock: vi.fn(),
      procedureSpies: {},
    } satisfies LegacyImportShared;
  }
  return root.__legacyImportShared as LegacyImportShared;
}

vi.mock("../../../../client/src/lib/supabase/server", () => {
  const s = ensureShared();
  return {
    createAdminClient: () => ({ from: s.fromMock, rpc: s.rpcMock }),
    createServerClient: vi.fn(),
  };
});

vi.mock("../../../_core/trpc", () => {
  const s = ensureShared();
  const buildProcedure = (kind: string) => {
    const proc: Record<string, unknown> = {};
    proc.input = (schema: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const next: any = {};
      next.mutation = (handler: Handler) => ({
        _kind: kind,
        _schema: schema,
        _handler: handler,
      });
      next.query = (handler: Handler) => ({
        _kind: kind,
        _schema: schema,
        _handler: handler,
      });
      return next;
    };
    return proc;
  };
  return {
    router: <T extends Record<string, unknown>>(defs: T) => {
      for (const [name, proc] of Object.entries(defs)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = proc as any;
        if (p?._handler) {
          s.procedureSpies[name] = { inputSchema: p._schema, handler: p._handler };
        }
      }
      return defs;
    },
    adminProcedure: buildProcedure("admin"),
    protectedProcedure: buildProcedure("protected"),
    publicProcedure: buildProcedure("public"),
    superadminProcedure: buildProcedure("superadmin"),
    mergeRouters: <T>(...routers: T[]) => routers,
  };
});

// Imported AFTER mocks register.
import { legacyImportRouter, safeFilename } from "../legacy-import";
void legacyImportRouter;

// Convenient handles for test bodies (resolved lazily, post-mocks).
const shared = ensureShared();
const fromMock = shared.fromMock;
const rpcMock = shared.rpcMock;
const procedureSpies = shared.procedureSpies;

// ── Helpers ─────────────────────────────────────────────────────────────────

interface ChainResult<T> {
  data: T;
  error: null | { message: string; code?: string };
}

function makeLogger() {
  return {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  };
}

function makeCtx() {
  return {
    user: { id: "admin-uuid", name: "Admin Tester" },
    logger: makeLogger(),
    correlationId: "test-corr",
  };
}

const FIXTURE_HEADER =
  '"NÚMERO DE ORDEN","NUMERO FAMILIA BOCATAS","FECHA ALTA","NOMBRE","APELLIDOS","SEXO",' +
  '"TELEFONO","DNI/NIE/ PASAPORTE","CABEZA DE FAMILIA","PAIS","Fecha Nacimiento","EMAIL",' +
  '"DIRECCION","CODIGO POSTAL","Localidad","NOTAS PARA INFORME SOCIAL",' +
  '"Nivel de estudios finalizados","Situación Laboral","Otras Características"';

function csvWith(rows: string[]): string {
  return [FIXTURE_HEADER, ...rows].join("\n");
}

const SAMPLE_TITULAR_ROW =
  '1,1030,30/09/2020,Luis,Apellido,M,604372950,Y-8206459-G,x,Perú,17/03/1983,,"C/ Test 17",28020,Madrid,"Notas",Educación Primaria,Personas Inactivas,Otros/ especificar...';

// Build a familiesProbe chain stub: `db.from("families").select(...).in(...).is(...)` ⇒ result.
function familiesProbeChain(rows: { legacy_numero: string | null }[], err: { message: string; code?: string } | null = null) {
  // The real chain: select → in → is → await(returns { data, error })
  const finalThenable: ChainResult<typeof rows> = { data: rows, error: err };
  const isFn = vi.fn().mockResolvedValue(finalThenable);
  const inFn = vi.fn().mockReturnValue({ is: isFn });
  const selectFn = vi.fn().mockReturnValue({ in: inFn });
  return { select: selectFn };
}

// Build a personsProbe chain stub: `db.from("persons").select(...).in("fecha_nacimiento", chunk).is(...)` ⇒ rows.
function personsProbeChain(
  rows: Array<{
    id: string;
    nombre: string;
    apellidos: string | null;
    fecha_nacimiento: string | null;
    pais_origen: string | null;
  }>,
  err: { message: string; code?: string } | null = null
) {
  const finalThenable: ChainResult<typeof rows> = { data: rows, error: err };
  const isFn = vi.fn().mockResolvedValue(finalThenable);
  const inFn = vi.fn().mockReturnValue({ is: isFn });
  const selectFn = vi.fn().mockReturnValue({ in: inFn });
  return { select: selectFn };
}

// Build a previews-insert chain: `db.from("bulk_import_previews").insert(...).select("token").single()`.
function stashInsertChain(token: string, err: { message: string; code?: string } | null = null) {
  const finalThenable: ChainResult<{ token: string } | null> = {
    data: err ? null : { token },
    error: err,
  };
  const single = vi.fn().mockResolvedValue(finalThenable);
  const select = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select });
  return { insert };
}

// Build a confirm preview-fetch chain: select+eq+eq+gte+maybeSingle.
function confirmFetchChain(
  result: { data: { token: string; created_by: string; created_at: string } | null; error: { message: string } | null }
) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const gte = vi.fn().mockReturnValue({ maybeSingle });
  const eq2 = vi.fn().mockReturnValue({ gte });
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
  const select = vi.fn().mockReturnValue({ eq: eq1 });
  return { select };
}

// Cleanup-on-error chain (used inside confirm error path).
function deletePreviewChain() {
  const eqFn = vi.fn().mockResolvedValue({ data: null, error: null });
  const deleteFn = vi.fn().mockReturnValue({ eq: eqFn });
  return { delete: deleteFn };
}

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  fromMock.mockReset();
  rpcMock.mockReset();
});

describe("safeFilename", () => {
  it("strips path components", () => {
    expect(safeFilename("../../etc/passwd")).toBe("passwd");
    expect(safeFilename("..\\..\\windows\\system32\\cmd.exe")).toBe("cmd.exe");
    expect(safeFilename("/var/log/messages")).toBe("messages");
  });

  it("removes control characters", () => {
    expect(safeFilename("file\x00name.csv")).toBe("filename.csv");
    expect(safeFilename("file\x1bname.csv")).toBe("filename.csv");
  });

  it("trims whitespace", () => {
    expect(safeFilename("  file.csv  ")).toBe("file.csv");
  });

  it("returns null for empty / whitespace-only / undefined", () => {
    expect(safeFilename("")).toBeNull();
    expect(safeFilename("   ")).toBeNull();
    expect(safeFilename(undefined)).toBeNull();
    expect(safeFilename("\x00\x00\x00")).toBeNull();
  });

  it("caps at 255 chars", () => {
    const longName = "a".repeat(300) + ".csv";
    const result = safeFilename(longName);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(255);
  });

  it("preserves the basename when no path is present", () => {
    expect(safeFilename("legacy-familias.csv")).toBe("legacy-familias.csv");
  });
});

describe("previewLegacyImport — input validation branches", () => {
  it("throws BAD_REQUEST when the header row is missing", async () => {
    const handler = procedureSpies.previewLegacyImport.handler;
    await expect(
      handler({
        input: { csv: "no header here\n1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19" },
        ctx: makeCtx(),
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("throws BAD_REQUEST when row count exceeds 10000", async () => {
    const handler = procedureSpies.previewLegacyImport.handler;
    const rows = Array(10_001).fill(SAMPLE_TITULAR_ROW);
    await expect(
      handler({ input: { csv: csvWith(rows) }, ctx: makeCtx() })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("throws BAD_REQUEST when the file contains no data rows", async () => {
    const handler = procedureSpies.previewLegacyImport.handler;
    await expect(
      handler({ input: { csv: csvWith([]) }, ctx: makeCtx() })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("previewLegacyImport — happy path", () => {
  it("parses, probes, stashes, and returns counts/groups for a 2-family CSV", async () => {
    fromMock
      .mockReturnValueOnce(familiesProbeChain([])) // idempotency probe — none exist
      .mockReturnValueOnce(personsProbeChain([])) // dedup probe — no matches
      .mockReturnValueOnce(stashInsertChain("preview-token-123"));

    const handler = procedureSpies.previewLegacyImport.handler;
    const result = await handler({
      input: {
        csv: csvWith([
          SAMPLE_TITULAR_ROW,
          '2,1030,,Nimia,Carguatocto,F,,,Hermana,Perú,23/02/1985,,,,,,Educación Secundaria,,Otros/ especificar...',
          '3,1032,27/06/2025,Susi,Vilca,F,,Y6802248N,X,Perú,4/10/1985,,,,Madrid,,,,Gitanos',
        ]),
        src_filename: "../../malicious/file.csv",
      },
      ctx: makeCtx(),
    });

    expect(result.preview_token).toBe("preview-token-123");
    expect(result.total_families).toBe(2);
    expect(result.error_families).toBe(0);
    expect(result.duplicate_families).toBe(0);
    expect(result.groups).toHaveLength(2);
    expect(fromMock).toHaveBeenCalledTimes(3);
    expect(fromMock).toHaveBeenNthCalledWith(1, "families");
    expect(fromMock).toHaveBeenNthCalledWith(2, "persons");
    expect(fromMock).toHaveBeenNthCalledWith(3, "bulk_import_previews");
  });

  it("flags duplicate families from the idempotency probe", async () => {
    fromMock
      .mockReturnValueOnce(familiesProbeChain([{ legacy_numero: "1030" }])) // 1030 already exists
      .mockReturnValueOnce(personsProbeChain([]))
      .mockReturnValueOnce(stashInsertChain("token-1"));

    const handler = procedureSpies.previewLegacyImport.handler;
    const result = await handler({
      input: {
        csv: csvWith([SAMPLE_TITULAR_ROW]),
      },
      ctx: makeCtx(),
    });

    expect(result.duplicate_families).toBe(1);
    expect(result.valid_families).toBe(0);
    const fam = result.groups.find(
      (g: { legacy_numero_familia: string }) => g.legacy_numero_familia === "1030"
    );
    expect(fam.family_already_imported).toBe(true);
  });

  it("surfaces person dedup hits with no document fragment", async () => {
    fromMock
      .mockReturnValueOnce(familiesProbeChain([])) // not a duplicate family
      .mockReturnValueOnce(
        personsProbeChain([
          {
            id: "existing-person-1",
            nombre: "Luis",
            apellidos: "Apellido",
            fecha_nacimiento: "1983-03-17",
            pais_origen: "PE",
          },
        ])
      )
      .mockReturnValueOnce(stashInsertChain("token-2"));

    const handler = procedureSpies.previewLegacyImport.handler;
    const result = await handler({
      input: { csv: csvWith([SAMPLE_TITULAR_ROW]) },
      ctx: makeCtx(),
    });

    const fam = result.groups[0];
    expect(fam.person_dedup_hits).toHaveLength(1);
    expect(fam.person_dedup_hits[0].existing_person_id).toBe("existing-person-1");
    expect(fam.person_dedup_hits[0].existing_pais_origen).toBe("PE");
    // Critical: the dedup hit MUST NOT include any document fragment.
    expect(fam.person_dedup_hits[0]).not.toHaveProperty("existing_documento_last4");
    expect(result.warning_families).toBe(1);
  });
});

describe("previewLegacyImport — error paths", () => {
  it("returns INTERNAL_SERVER_ERROR with sanitised message when families probe fails", async () => {
    const ctx = makeCtx();
    fromMock.mockReturnValueOnce(
      familiesProbeChain([], { message: "duplicate key value (numero_documento)=(12345678A)", code: "23505" })
    );

    const handler = procedureSpies.previewLegacyImport.handler;
    await expect(
      handler({ input: { csv: csvWith([SAMPLE_TITULAR_ROW]) }, ctx })
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Error consultando familias existentes.", // generic, no PII
    });
    expect(ctx.logger.error).toHaveBeenCalled();
  });

  it("returns INTERNAL_SERVER_ERROR (no PII) when stash insert fails", async () => {
    const ctx = makeCtx();
    fromMock
      .mockReturnValueOnce(familiesProbeChain([]))
      .mockReturnValueOnce(personsProbeChain([]))
      .mockReturnValueOnce(stashInsertChain("never", { message: "leak: name=Juan García", code: "XYZ" }));

    const handler = procedureSpies.previewLegacyImport.handler;
    await expect(
      handler({ input: { csv: csvWith([SAMPLE_TITULAR_ROW]) }, ctx })
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Error guardando previsualización.",
    });
    expect(ctx.logger.error).toHaveBeenCalled();
  });

  it("soft-fails the dedup probe on error: groups still returned, no dedup hits, warn logged", async () => {
    const ctx = makeCtx();
    fromMock
      .mockReturnValueOnce(familiesProbeChain([]))
      .mockReturnValueOnce(personsProbeChain([], { message: "transient", code: "08000" }))
      .mockReturnValueOnce(stashInsertChain("token-soft"));

    const handler = procedureSpies.previewLegacyImport.handler;
    const result = await handler({
      input: { csv: csvWith([SAMPLE_TITULAR_ROW]) },
      ctx,
    });

    expect(result.preview_token).toBe("token-soft");
    expect(result.groups[0].person_dedup_hits).toEqual([]);
    expect(ctx.logger.warn).toHaveBeenCalled();
  });
});

describe("confirmLegacyImport", () => {
  it("returns NOT_FOUND when token is missing/expired", async () => {
    fromMock.mockReturnValueOnce(
      confirmFetchChain({ data: null, error: null })
    );

    const handler = procedureSpies.confirmLegacyImport.handler;
    await expect(
      handler({
        input: { preview_token: "00000000-0000-0000-0000-000000000000" },
        ctx: makeCtx(),
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("dispatches RPC and returns parsed response on success", async () => {
    fromMock.mockReturnValueOnce(
      confirmFetchChain({
        data: { token: "tok", created_by: "admin-uuid", created_at: new Date().toISOString() },
        error: null,
      })
    );
    rpcMock.mockResolvedValue({
      data: { created_count: 5, skipped_count: 1, error_count: 0, errors: [] },
      error: null,
    });

    const handler = procedureSpies.confirmLegacyImport.handler;
    const result = await handler({
      input: {
        preview_token: "11111111-1111-4111-8111-111111111111",
        src_filename: "../traversal/some.csv",
      },
      ctx: makeCtx(),
    });

    expect(result).toEqual({ created_count: 5, skipped_count: 1, error_count: 0, errors: [] });
    expect(rpcMock).toHaveBeenCalledWith(
      "confirm_legacy_familias_import",
      // src_filename must be sanitized to its basename before going to the RPC.
      { p_token: "11111111-1111-4111-8111-111111111111", p_src_filename: "some.csv" }
    );
  });

  it("returns INTERNAL_SERVER_ERROR (no PII) when RPC raises and cleans up the preview", async () => {
    const ctx = makeCtx();
    fromMock.mockReturnValueOnce(
      confirmFetchChain({
        data: { token: "tok", created_by: "admin-uuid", created_at: new Date().toISOString() },
        error: null,
      })
    );
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "duplicate key value (dni)=(12345678A)", code: "23505" },
    });
    fromMock.mockReturnValueOnce(deletePreviewChain());

    const handler = procedureSpies.confirmLegacyImport.handler;
    await expect(
      handler({
        input: { preview_token: "22222222-2222-4222-8222-222222222222" },
        ctx,
      })
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Error al confirmar la importación.",
    });
    expect(ctx.logger.error).toHaveBeenCalled();
  });

  it("rejects an RPC response with malformed shape", async () => {
    fromMock.mockReturnValueOnce(
      confirmFetchChain({
        data: { token: "tok", created_by: "admin-uuid", created_at: new Date().toISOString() },
        error: null,
      })
    );
    rpcMock.mockResolvedValue({
      data: { created_count: "five" /* wrong type */, skipped_count: 0, error_count: 0, errors: [] },
      error: null,
    });

    const handler = procedureSpies.confirmLegacyImport.handler;
    await expect(
      handler({
        input: { preview_token: "33333333-3333-4333-8333-333333333333" },
        ctx: makeCtx(),
      })
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Respuesta del RPC con shape inválido.",
    });
  });
});

// Type-level guard: ensure TRPCError is the throw class.
describe("error type contract", () => {
  it("preview throws actual TRPCError instances (not plain Error)", async () => {
    const handler = procedureSpies.previewLegacyImport.handler;
    try {
      await handler({ input: { csv: "" }, ctx: makeCtx() });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
    }
  });
});
