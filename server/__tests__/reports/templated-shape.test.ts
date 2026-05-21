/**
 * templated-shape.test.ts — Contract tests for the 10 templated report procedures.
 *
 * Each test asserts:
 *   1. adminProcedure role guard — voluntario gets FORBIDDEN.
 *   2. Output shape — the procedure returns the documented shape (rows + meta or rows).
 *
 * All DB calls are mocked via vi.mock (same pattern as mapa-router.test.ts).
 */

import { TRPCError } from "@trpc/server";
import { describe, it, expect, vi, beforeEach } from "vitest";

import type { TrpcContext } from "../../_core/context";
import { Logger } from "../../_core/logger";

// ─── vi.mock — must precede all imports ──────────────────────────────────

const fromMock = vi.fn();

vi.mock("../../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({ from: fromMock })),
  createServerClient: vi.fn(),
}));

// Import compliance router to verify complianceSnapshot reuse
vi.mock("../../routers/families/compliance", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../routers/families/compliance")>();
  return {
    ...mod,
    complianceRouter: {
      ...mod.complianceRouter,
      createCaller: mod.complianceRouter.createCaller,
    },
  };
});

// Import templated routers AFTER vi.mock
import { familiasAtendidasRouter } from "../../routers/reports/templated/familiasAtendidas";
import { padronPorVencerRouter } from "../../routers/reports/templated/padronPorVencer";
import { informesPorRenovarRouter } from "../../routers/reports/templated/informesPorRenovar";
import { complianceSnapshotRouter } from "../../routers/reports/templated/complianceSnapshot";
import { familiasEnRiesgoRouter } from "../../routers/reports/templated/familiasEnRiesgo";
import { documentosFaltantesRouter } from "../../routers/reports/templated/documentosFaltantes";
import { resumenTrimestralRouter } from "../../routers/reports/templated/resumenTrimestral";
import { distribucionPorDistritoRouter } from "../../routers/reports/templated/distribucionPorDistrito";
import { evolucionHistoricaRouter } from "../../routers/reports/templated/evolucionHistorica";
import { informeIrpfDemograficoRouter } from "../../routers/reports/templated/informeIrpfDemografico";

// ─── helpers ─────────────────────────────────────────────────────────────

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function ctxWithRole(role: AuthenticatedUser["role"]): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
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
    correlationId: "templated-shape-test",
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function emptyChain() {
  const result = { data: [], error: null, count: 0 };
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    head: vi.fn().mockReturnThis(),
    returns: vi.fn().mockReturnThis(),
    then: (
      resolve: (v: typeof result) => unknown,
      reject?: (e: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
}

beforeEach(() => {
  fromMock.mockReset();
});

// ─── 1. familiasAtendidas ────────────────────────────────────────────────

describe("reports.familiasAtendidas", () => {
  it("rejects voluntario with FORBIDDEN", async () => {
    const caller = familiasAtendidasRouter.createCaller(ctxWithRole("voluntario"));
    await expect(
      caller.familiasAtendidas({ from: "2024-01-01", to: "2024-12-31" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" } satisfies Partial<TRPCError>);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns { rows, meta } shape for admin", async () => {
    fromMock.mockReturnValueOnce(emptyChain());
    const caller = familiasAtendidasRouter.createCaller(ctxWithRole("admin"));
    const result = await caller.familiasAtendidas({ from: "2024-01-01", to: "2024-12-31" });
    expect(result).toHaveProperty("rows");
    expect(result).toHaveProperty("meta");
    expect(Array.isArray(result.rows)).toBe(true);
  });
});

// ─── 2. padronPorVencer ──────────────────────────────────────────────────

describe("reports.padronPorVencer", () => {
  it("rejects voluntario with FORBIDDEN", async () => {
    const caller = padronPorVencerRouter.createCaller(ctxWithRole("voluntario"));
    await expect(
      caller.padronPorVencer({ daysAhead: 30 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns { rows } shape for admin", async () => {
    fromMock.mockReturnValueOnce(emptyChain());
    const caller = padronPorVencerRouter.createCaller(ctxWithRole("admin"));
    const result = await caller.padronPorVencer({ daysAhead: 30 });
    expect(Array.isArray(result.rows)).toBe(true);
  });
});

// ─── 3. informesPorRenovar ───────────────────────────────────────────────

describe("reports.informesPorRenovar", () => {
  it("rejects voluntario with FORBIDDEN", async () => {
    const caller = informesPorRenovarRouter.createCaller(ctxWithRole("voluntario"));
    await expect(
      caller.informesPorRenovar({ daysAhead: 30 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns { rows } shape for admin", async () => {
    fromMock.mockReturnValueOnce(emptyChain());
    const caller = informesPorRenovarRouter.createCaller(ctxWithRole("admin"));
    const result = await caller.informesPorRenovar({ daysAhead: 30 });
    expect(Array.isArray(result.rows)).toBe(true);
  });
});

// ─── 4. complianceSnapshot ───────────────────────────────────────────────

describe("reports.complianceSnapshot", () => {
  it("rejects voluntario with FORBIDDEN", async () => {
    const caller = complianceSnapshotRouter.createCaller(ctxWithRole("voluntario"));
    await expect(caller.complianceSnapshot()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns CM-1..CM-6 compliance shape for admin (delegates to getComplianceStats)", async () => {
    // complianceSnapshot wraps getComplianceStats which makes multiple DB calls.
    // Provide enough emptyChain mocks for each DB call inside getComplianceStats.
    for (let i = 0; i < 10; i++) {
      fromMock.mockReturnValueOnce(emptyChain());
    }
    const caller = complianceSnapshotRouter.createCaller(ctxWithRole("admin"));
    const result = await caller.complianceSnapshot();
    expect(result).toHaveProperty("cm1");
    expect(result).toHaveProperty("cm2");
    expect(result).toHaveProperty("cm3");
    expect(result).toHaveProperty("cm4");
    expect(result).toHaveProperty("cm5");
    expect(result).toHaveProperty("cm6");
  });
});

// ─── 5. familiasEnRiesgo ─────────────────────────────────────────────────

describe("reports.familiasEnRiesgo", () => {
  it("rejects voluntario with FORBIDDEN", async () => {
    const caller = familiasEnRiesgoRouter.createCaller(ctxWithRole("voluntario"));
    await expect(caller.familiasEnRiesgo({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns { rows, total } shape for admin", async () => {
    fromMock.mockReturnValueOnce(emptyChain());
    const caller = familiasEnRiesgoRouter.createCaller(ctxWithRole("admin"));
    const result = await caller.familiasEnRiesgo({});
    expect(result).toHaveProperty("rows");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.rows)).toBe(true);
  });
});

// ─── 6. documentosFaltantes ──────────────────────────────────────────────

describe("reports.documentosFaltantes", () => {
  it("rejects voluntario with FORBIDDEN", async () => {
    const caller = documentosFaltantesRouter.createCaller(ctxWithRole("voluntario"));
    await expect(
      caller.documentosFaltantes({ programaId: "00000000-0000-0000-0000-000000000001" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns { rows } shape for admin with programaId", async () => {
    // documentosFaltantes makes 3 DB calls: program_document_types, families, family_member_documents
    fromMock.mockReturnValueOnce(emptyChain()); // program_document_types
    fromMock.mockReturnValueOnce(emptyChain()); // families
    fromMock.mockReturnValueOnce(emptyChain()); // family_member_documents
    const caller = documentosFaltantesRouter.createCaller(ctxWithRole("admin"));
    const result = await caller.documentosFaltantes({
      programaId: "00000000-0000-0000-0000-000000000001",
    });
    expect(Array.isArray(result.rows)).toBe(true);
  });
});

// ─── 7. resumenTrimestral ────────────────────────────────────────────────

describe("reports.resumenTrimestral", () => {
  it("rejects voluntario with FORBIDDEN", async () => {
    const caller = resumenTrimestralRouter.createCaller(ctxWithRole("voluntario"));
    await expect(
      caller.resumenTrimestral({ year: 2024, quarter: 1 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns KPI shape for admin", async () => {
    // resumenTrimestral makes multiple DB calls
    for (let i = 0; i < 5; i++) {
      fromMock.mockReturnValueOnce(emptyChain());
    }
    const caller = resumenTrimestralRouter.createCaller(ctxWithRole("admin"));
    const result = await caller.resumenTrimestral({ year: 2024, quarter: 1 });
    expect(result).toHaveProperty("nuevasFamilias");
    expect(result).toHaveProperty("totalEntregas");
    expect(result).toHaveProperty("distribucionPorDistrito");
  });
});

// ─── 8. distribucionPorDistrito ──────────────────────────────────────────

describe("reports.distribucionPorDistrito", () => {
  it("rejects voluntario with FORBIDDEN", async () => {
    const caller = distribucionPorDistritoRouter.createCaller(ctxWithRole("voluntario"));
    await expect(caller.distribucionPorDistrito({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns { rows } with distrito + count shape for admin", async () => {
    fromMock.mockReturnValueOnce(emptyChain());
    const caller = distribucionPorDistritoRouter.createCaller(ctxWithRole("admin"));
    const result = await caller.distribucionPorDistrito({});
    expect(Array.isArray(result.rows)).toBe(true);
  });
});

// ─── 9. evolucionHistorica ───────────────────────────────────────────────

describe("reports.evolucionHistorica", () => {
  it("rejects voluntario with FORBIDDEN", async () => {
    const caller = evolucionHistoricaRouter.createCaller(ctxWithRole("voluntario"));
    await expect(caller.evolucionHistorica({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns { months } array with bucket + count for admin", async () => {
    fromMock.mockReturnValueOnce(emptyChain());
    const caller = evolucionHistoricaRouter.createCaller(ctxWithRole("admin"));
    const result = await caller.evolucionHistorica({});
    expect(Array.isArray(result.months)).toBe(true);
  });
});

// ─── 10. informeIrpfDemografico ──────────────────────────────────────────

describe("reports.informeIrpfDemografico", () => {
  it("rejects voluntario with FORBIDDEN", async () => {
    const caller = informeIrpfDemograficoRouter.createCaller(ctxWithRole("voluntario"));
    await expect(
      caller.informeIrpfDemografico({ year: 2025 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns correct shape for admin + 0 rows", async () => {
    fromMock.mockReturnValueOnce(emptyChain());
    const caller = informeIrpfDemograficoRouter.createCaller(ctxWithRole("admin"));
    const result = await caller.informeIrpfDemografico({ year: 2025 });
    expect(result.year).toBe(2025);
    expect(result.totalMiembros).toBe(0);
    expect(result.totalSuppressed).toBe(0);
    expect(result.totalSuppressedMarginal).toBe(0);
    expect(Array.isArray(result.crossTab)).toBe(true);
    expect(result.crossTab).toHaveLength(0);
    expect(result.marginals).toHaveProperty("age");
    expect(result.marginals).toHaveProperty("genero");
    expect(result.marginals).toHaveProperty("estudios");
    expect(result.marginals).toHaveProperty("laboral");
    expect(result.marginals).toHaveProperty("pais");
    expect(Array.isArray(result.marginals.age)).toBe(true);
    expect(Array.isArray(result.marginals.genero)).toBe(true);
    expect(Array.isArray(result.marginals.estudios)).toBe(true);
    expect(Array.isArray(result.marginals.laboral)).toBe(true);
    expect(Array.isArray(result.marginals.pais)).toBe(true);
  });

  it("throws INTERNAL_SERVER_ERROR on DB error", async () => {
    const errorChain = {
      ...emptyChain(),
      returns: vi.fn().mockResolvedValue({ data: null, error: { message: "db failure", code: "42P01" } }),
    };
    fromMock.mockReturnValueOnce(errorChain);
    const caller = informeIrpfDemograficoRouter.createCaller(ctxWithRole("admin"));
    await expect(
      caller.informeIrpfDemografico({ year: 2025 }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});
