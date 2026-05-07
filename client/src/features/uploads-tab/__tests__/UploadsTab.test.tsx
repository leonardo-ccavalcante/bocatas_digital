/**
 * Contract-first tests for <UploadsTab programaId />.
 *
 * Verifies that the tab exposes the three data-tools buttons:
 *   - "Exportar CSV"
 *   - "Importar CSV interno"
 *   - "Importar CSV legacy"
 *
 * Iron Law: these tests define the contract. Fix the component, never the test.
 */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(cleanup);

// ── jsdom stubs ───────────────────────────────────────────────────────────────
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = global.ResizeObserver ?? ResizeObserverStub;
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}

// ── Mock all child components so the test is unit-level ───────────────────────
vi.mock("../PendientesGrid", () => ({ PendientesGrid: () => <div data-testid="pendientes-grid" /> }));
vi.mock("../TiposCatalog", () => ({ TiposCatalog: () => <div data-testid="tipos-catalog" /> }));
vi.mock("../ArchiveExplorer", () => ({ ArchiveExplorer: () => <div data-testid="archive-explorer" /> }));
vi.mock("../UploadModal", () => ({ UploadModal: () => <div data-testid="upload-modal" /> }));
vi.mock("../ClassifyModal", () => ({ ClassifyModal: () => <div data-testid="classify-modal" /> }));
vi.mock("@/components/ExportFamiliesModal", () => ({
  ExportFamiliesModal: ({ open }: { open: boolean }) => (
    <div data-testid="export-modal" data-open={String(open)} />
  ),
}));
vi.mock("@/components/ImportFamiliesModal", () => ({
  ImportFamiliesModal: ({ open }: { open: boolean }) => (
    <div data-testid="import-modal" data-open={String(open)} />
  ),
}));
vi.mock("@/components/BulkImportFamiliasLegacyModal", () => ({
  BulkImportFamiliasLegacyModal: ({ open }: { open: boolean }) => (
    <div data-testid="legacy-import-modal" data-open={String(open)} />
  ),
}));

// ── Import after mocks ────────────────────────────────────────────────────────
import UploadsTab from "../index";

describe("UploadsTab — data tools section", () => {
  it("renders the 'Exportar CSV' button", () => {
    render(<UploadsTab programaId="test-program-id" />);
    expect(screen.getByRole("button", { name: /exportar csv/i })).toBeInTheDocument();
  });

  it("renders the 'Importar CSV interno' button", () => {
    render(<UploadsTab programaId="test-program-id" />);
    expect(screen.getByRole("button", { name: /importar csv interno/i })).toBeInTheDocument();
  });

  it("renders the 'Importar CSV legacy' button", () => {
    render(<UploadsTab programaId="test-program-id" />);
    expect(screen.getByRole("button", { name: /importar csv legacy/i })).toBeInTheDocument();
  });

  it("renders the existing 'Subir documento' button", () => {
    render(<UploadsTab programaId="test-program-id" />);
    expect(screen.getByRole("button", { name: /subir documento/i })).toBeInTheDocument();
  });

  it("renders the ExportFamiliesModal (closed by default)", () => {
    render(<UploadsTab programaId="test-program-id" />);
    expect(screen.getByTestId("export-modal")).toHaveAttribute("data-open", "false");
  });

  it("renders the ImportFamiliesModal (closed by default)", () => {
    render(<UploadsTab programaId="test-program-id" />);
    expect(screen.getByTestId("import-modal")).toHaveAttribute("data-open", "false");
  });

  it("renders the BulkImportFamiliasLegacyModal (closed by default)", () => {
    render(<UploadsTab programaId="test-program-id" />);
    expect(screen.getByTestId("legacy-import-modal")).toHaveAttribute("data-open", "false");
  });
});
