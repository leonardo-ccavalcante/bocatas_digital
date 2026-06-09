/**
 * HojaDrawer.test.tsx
 *
 * Contract tests for <HojaDrawer /> preview modal before document generation.
 *
 * Key contracts:
 *   - Clicking "Generar Word" shows a preview modal with nombre + intervention count
 *   - Clicking "Confirmar" in the modal triggers the actual generation
 *   - Clicking "Cancelar" in the modal does NOT trigger generation
 *
 * Iron Law: these tests define the contract. Fix the component, never the test.
 */

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── jsdom stubs ───────────────────────────────────────────────────────────────
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = global.ResizeObserver ?? ResizeObserverStub;

// ── tRPC mock ─────────────────────────────────────────────────────────────────
const { mockGetHojaUseQuery, mockGenerateDocxFetch } = vi.hoisted(() => ({
  mockGetHojaUseQuery: vi.fn(),
  mockGenerateDocxFetch: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    derivar: {
      getHoja: { useQuery: mockGetHojaUseQuery },
      generateDocx: { fetch: mockGenerateDocxFetch },
      generatePdf: { fetch: vi.fn() },
    },
    useUtils: vi.fn(() => ({
      derivar: {
        generateDocx: { fetch: mockGenerateDocxFetch },
        generatePdf: { fetch: vi.fn() },
      },
    })),
  },
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { HojaDrawer } from "../HojaDrawer";

const sampleHoja = {
  hoja: {
    id: "hoja-1",
    scope: "persona",
    fecha_apertura: "2026-05-20",
    profesional_nombre: "Sole",
    persona: { nombre: "Raúl", apellidos: "Uzcategui" },
    familia: null,
    programa: { name: "Programa Familias" },
  },
  intervenciones: [
    {
      id: "iv-1",
      fecha: "2026-05-21",
      tipo_slug: "salud",
      descripcion: "Derivación a MdM",
      observaciones: null,
      firmado_url: null,
      institucion_snapshot: { nombre: "Médicos del Mundo" },
    },
    {
      id: "iv-2",
      fecha: "2026-05-22",
      tipo_slug: "vivienda",
      descripcion: "Derivación a Cruz Roja",
      observaciones: null,
      firmado_url: null,
      institucion_snapshot: { nombre: "Cruz Roja" },
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("HojaDrawer — preview modal before document generation", () => {
  it("shows a preview modal when 'Generar Word' is clicked", async () => {
    mockGetHojaUseQuery.mockReturnValue({
      data: sampleHoja,
      isLoading: false,
      error: null,
    });

    const user = userEvent.setup();
    render(
      <HojaDrawer
        hojaId="hoja-1"
        onClose={vi.fn()}
        onAddIntervention={vi.fn()}
      />,
    );

    const generateBtn = screen.getByRole("button", { name: /generar word/i });
    await user.click(generateBtn);

    // Preview modal should appear with nombre and intervention count
    expect(screen.getByRole("dialog", { name: /vista previa/i })).toBeInTheDocument();
    expect(screen.getByText(/Raúl Uzcategui/i)).toBeInTheDocument();
    expect(screen.getByText(/2 intervenciones/i)).toBeInTheDocument();
  });

  it("calls generateDocx.fetch only after confirming in the preview modal", async () => {
    mockGetHojaUseQuery.mockReturnValue({
      data: sampleHoja,
      isLoading: false,
      error: null,
    });
    mockGenerateDocxFetch.mockResolvedValue({
      contentBase64: btoa("fake-docx"),
      filename: "test.docx",
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    const user = userEvent.setup();
    render(
      <HojaDrawer
        hojaId="hoja-1"
        onClose={vi.fn()}
        onAddIntervention={vi.fn()}
      />,
    );

    // Click "Generar Word" — should show modal, NOT call fetch yet
    await user.click(screen.getByRole("button", { name: /generar word/i }));
    expect(mockGenerateDocxFetch).not.toHaveBeenCalled();

    // Confirm in modal — should call fetch
    await user.click(screen.getByRole("button", { name: /confirmar/i }));
    await waitFor(() => expect(mockGenerateDocxFetch).toHaveBeenCalledTimes(1));
  });

  it("does NOT call generateDocx.fetch when 'Cancelar' is clicked in the modal", async () => {
    mockGetHojaUseQuery.mockReturnValue({
      data: sampleHoja,
      isLoading: false,
      error: null,
    });

    const user = userEvent.setup();
    render(
      <HojaDrawer
        hojaId="hoja-1"
        onClose={vi.fn()}
        onAddIntervention={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /generar word/i }));
    await user.click(screen.getByRole("button", { name: /cancelar/i }));

    expect(mockGenerateDocxFetch).not.toHaveBeenCalled();
    // Modal should be closed
    expect(screen.queryByRole("dialog", { name: /vista previa/i })).not.toBeInTheDocument();
  });
});
