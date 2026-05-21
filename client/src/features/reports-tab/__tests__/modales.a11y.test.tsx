/**
 * @vitest-environment jsdom
 *
 * modales.a11y.test.tsx — Smoke tests de accesibilidad para los 10 modales de reports.
 *
 * Contract (karpathy §1 — Root Cause):
 *   Cada modal debe renderizar un `role="dialog"` con nombre accesible cuando `open={true}`.
 *   Esto verifica que Radix UI puede encontrar el `titleId` en el DOM (sin el warning
 *   "DialogContent requires a DialogTitle").
 *
 *   El fix aplicado (bc91da9c) eliminó los `id=` manuales en `DialogTitle` y los
 *   `aria-labelledby=` en `DialogContent`. Radix gestiona el `titleId` automáticamente.
 *
 * Tests:
 *   1.  FamiliasAtendidasModal     → dialog name "Familias atendidas"
 *   2.  FamiliasEnRiesgoModal      → dialog name "Familias en riesgo"
 *   3.  DistribucionPorDistritoModal → dialog name "Distribución por distrito"
 *   4.  DocumentosFaltantesModal   → dialog name "Documentos faltantes"
 *   5.  EvolucionHistoricaModal    → dialog name "Evolución histórica"
 *   6.  InformesPorRenovarModal    → dialog name "Informes sociales por renovar"
 *   7.  PadronPorVencerModal       → dialog name "Padrón por vencer"
 *   8.  ResumenTrimestralModal     → dialog name "Resumen trimestral"
 *   9.  IrpfDemograficoModal       → dialog name "IRPF Demográfico"
 *   10. ComplianceSnapshotModal    → dialog name "Compliance — estado actual"
 *
 * Iron Law: estos tests definen el contrato. Arreglar el componente, nunca el test.
 */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// ── jsdom stubs ───────────────────────────────────────────────────────────────
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = global.ResizeObserver ?? ResizeObserverStub;

// ── Mock global de useTemplatedReports ────────────────────────────────────────
vi.mock("../hooks/useTemplatedReports", () => ({
  useFamiliasAtendidas: vi.fn(() => ({ data: null, isLoading: false, error: null })),
  useFamiliasEnRiesgo: vi.fn(() => ({ data: null, isLoading: false, error: null })),
  useDistribucionPorDistrito: vi.fn(() => ({ data: null, isLoading: false, error: null })),
  useDocumentosFaltantes: vi.fn(() => ({ data: null, isLoading: false, error: null })),
  useEvolucionHistorica: vi.fn(() => ({ data: null, isLoading: false, error: null })),
  useInformesPorRenovar: vi.fn(() => ({ data: null, isLoading: false, error: null })),
  usePadronPorVencer: vi.fn(() => ({ data: null, isLoading: false, error: null })),
  useResumenTrimestral: vi.fn(() => ({ data: null, isLoading: false, error: null })),
  useIrpfDemografico: vi.fn(() => ({ data: undefined, isLoading: false, error: null })),
}));

// ── Mock de ComplianceDashboard (tiene sus propios hooks de tRPC) ─────────────
vi.mock("@/features/families/components/ComplianceDashboard", () => ({
  ComplianceDashboard: () => <div data-testid="compliance-dashboard">Dashboard</div>,
}));

// ── Mock de exportCsv ─────────────────────────────────────────────────────────
vi.mock("../utils/exportCsv", () => ({
  exportRowsAsCsv: vi.fn(),
}));

// ── Imports de los modales ────────────────────────────────────────────────────
import { FamiliasAtendidasModal } from "../templates/FamiliasAtendidasModal";
import { FamiliasEnRiesgoModal } from "../templates/FamiliasEnRiesgoModal";
import { DistribucionPorDistritoModal } from "../templates/DistribucionPorDistritoModal";
import { DocumentosFaltantesModal } from "../templates/DocumentosFaltantesModal";
import { EvolucionHistoricaModal } from "../templates/EvolucionHistoricaModal";
import { InformesPorRenovarModal } from "../templates/InformesPorRenovarModal";
import { PadronPorVencerModal } from "../templates/PadronPorVencerModal";
import { ResumenTrimestralModal } from "../templates/ResumenTrimestralModal";
import { IrpfDemograficoModal } from "../templates/IrpfDemograficoModal";
import { ComplianceSnapshotModal } from "../templates/ComplianceSnapshotModal";

// ── Helper ────────────────────────────────────────────────────────────────────
const noop = () => {};

afterEach(cleanup);

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("Reports modals — accessible dialog names (a11y smoke)", () => {
  it("1. FamiliasAtendidasModal renders dialog with accessible name", () => {
    render(<FamiliasAtendidasModal open={true} onClose={noop} />);
    expect(screen.getByRole("dialog", { name: /familias atendidas/i })).toBeInTheDocument();
  });

  it("2. FamiliasEnRiesgoModal renders dialog with accessible name", () => {
    render(<FamiliasEnRiesgoModal open={true} onClose={noop} />);
    expect(screen.getByRole("dialog", { name: /familias en riesgo/i })).toBeInTheDocument();
  });

  it("3. DistribucionPorDistritoModal renders dialog with accessible name", () => {
    render(<DistribucionPorDistritoModal open={true} onClose={noop} />);
    expect(screen.getByRole("dialog", { name: /distribución por distrito/i })).toBeInTheDocument();
  });

  it("4. DocumentosFaltantesModal renders dialog with accessible name", () => {
    render(<DocumentosFaltantesModal open={true} onClose={noop} />);
    expect(screen.getByRole("dialog", { name: /documentos faltantes/i })).toBeInTheDocument();
  });

  it("5. EvolucionHistoricaModal renders dialog with accessible name", () => {
    render(<EvolucionHistoricaModal open={true} onClose={noop} />);
    expect(screen.getByRole("dialog", { name: /evolución histórica/i })).toBeInTheDocument();
  });

  it("6. InformesPorRenovarModal renders dialog with accessible name", () => {
    render(<InformesPorRenovarModal open={true} onClose={noop} />);
    expect(screen.getByRole("dialog", { name: /informes sociales por renovar/i })).toBeInTheDocument();
  });

  it("7. PadronPorVencerModal renders dialog with accessible name", () => {
    render(<PadronPorVencerModal open={true} onClose={noop} />);
    expect(screen.getByRole("dialog", { name: /padrón por vencer/i })).toBeInTheDocument();
  });

  it("8. ResumenTrimestralModal renders dialog with accessible name", () => {
    render(<ResumenTrimestralModal open={true} onClose={noop} />);
    expect(screen.getByRole("dialog", { name: /resumen trimestral/i })).toBeInTheDocument();
  });

  it("9. IrpfDemograficoModal renders dialog with accessible name", () => {
    render(<IrpfDemograficoModal open={true} onClose={noop} />);
    expect(screen.getByRole("dialog", { name: /irpf demográfico/i })).toBeInTheDocument();
  });

  it("10. ComplianceSnapshotModal renders dialog with accessible name", () => {
    render(<ComplianceSnapshotModal open={true} onClose={noop} />);
    expect(screen.getByRole("dialog", { name: /compliance — estado actual/i })).toBeInTheDocument();
  });
});
