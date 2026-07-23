/**
 * sesiones.test.tsx — Behavioral tests for cierre de sesión UI (Wave 3).
 *
 * Five behavioral contracts:
 * 1. CloseConfigEditor never renders raw tipo slugs as visible text.
 * 2. SesionAsistenciaBlock QR-not-enrolled shows the enroll prompt.
 * 3. ComplianceDashboard (mounted from Dashboard page when a specific session-managed
 *    edition is selected) renders N/M totals and ausencia alert chips.
 * 4. EnlaceSessionView shows a friendly error screen on bad/expired token.
 * 5. EnlaceSessionView hides all admin chrome when showing error state.
 *
 * Architecture note (TEST 3): ComplianceDashboard is placed in /dashboard page,
 * not in ProgramaDetalle/ProgramTabs. It appears when Dashboard's programa filter
 * selects a specific program with inscribible=true. CalendarioSesiones shows a
 * lightweight glance stat (Planes N/M) in its header without the full compliance view.
 *
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = global.ResizeObserver ?? ResizeObserverStub;

// ─── tRPC mock helpers ────────────────────────────────────────────────────────

const { mockGetCloseConfig, mockMutateMarcar, mockUseMutationMarcar,
  mockGetCompliance, mockEnlaceGetSession, mockUseMutationEnlace } = vi.hoisted(() => ({
  mockGetCloseConfig: vi.fn(),
  mockMutateMarcar: vi.fn(),
  mockUseMutationMarcar: vi.fn(),
  mockGetCompliance: vi.fn(),
  mockEnlaceGetSession: vi.fn(),
  mockUseMutationEnlace: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    programs: {
      closeConfig: {
        getCloseConfig: { useQuery: mockGetCloseConfig },
        updateCloseConfig: { useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })) },
        applyPreset: { useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })) },
      },
      enlace: {
        marcarAsistenciaSesion: { useMutation: mockUseMutationMarcar },
        enlaceGetSession: { useMutation: mockUseMutationEnlace },
        enlaceMarcarAsistencia: { useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })) },
        enlaceCerrar: { useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })) },
      },
      compliance: {
        getComplianceEdicion: { useQuery: mockGetCompliance },
      },
      sessionDocuments: {
        uploadSessionDocument: { useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })) },
        enlaceUploadSessionDocument: { useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })) },
        extractLessonPlan: { useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })) },
        enlaceExtractLessonPlan: { useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })) },
        getSessionDocuments: { useQuery: vi.fn(() => ({ data: [], isLoading: false })) },
      },
    },
    useUtils: vi.fn(() => ({
      programs: {
        sessions: { listSesiones: { invalidate: vi.fn() } },
        compliance: { getComplianceEdicion: { invalidate: vi.fn() } },
        sessionDocuments: { getSessionDocuments: { invalidate: vi.fn() } },
      },
    })),
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1", role: "admin" } }),
}));

// QRScanner uses getUserMedia which is unavailable in jsdom
vi.mock("@/features/checkin/components/QRScanner", () => ({
  QRScanner: ({ onDecoded }: { onDecoded: (v: string) => void; onCancel: () => void }) => (
    <div data-testid="qr-scanner-mock">
      <button onClick={() => onDecoded("bocatas://person/00000000-0000-0000-0000-000000000001?sig=abcd1234")}>
        Simulate scan
      </button>
    </div>
  ),
}));

afterEach(() => { cleanup(); });

// ─── Helpers ─────────────────────────────────────────────────────────────────
function renderWithRouter(ui: React.ReactElement) {
  const loc = memoryLocation({ path: "/test" });
  return render(
    <Router hook={loc.hook} searchHook={loc.searchHook}>
      {ui}
    </Router>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 1 — CloseConfigEditor never shows raw tipo slugs
// ═══════════════════════════════════════════════════════════════════════════

describe("CloseConfigEditor — domain language (never raw tipo slugs)", () => {
  it("does not render the raw tipo slug values in visible field descriptions", async () => {
    mockGetCloseConfig.mockReturnValue({
      isLoading: false,
      data: {
        enabled: true,
        tema_obligatorio: false,
        fields: [
          { slug: "raciones", label: "Raciones servidas", tipo: "numero", obligatorio: true },
          { slug: "incidencias", label: "Incidencias", tipo: "texto", obligatorio: false },
          { slug: "asistentes", label: "Asistentes", tipo: "contagem_personas", obligatorio: true },
          { slug: "pesos", label: "Peso total", tipo: "kg", obligatorio: false },
          { slug: "voluntarios", label: "Voluntarios", tipo: "lista_voluntarios", obligatorio: false },
        ],
        uploads: [],
      },
    });

    const { CloseConfigEditor } = await import("../components/sessions/CloseConfigEditor");
    renderWithRouter(<CloseConfigEditor programId="prog-1" isAdmin={true} />);

    await waitFor(() => {
      expect(screen.queryByText("numero")).toBeNull();
      expect(screen.queryByText("texto")).toBeNull();
      expect(screen.queryByText("contagem_personas")).toBeNull();
      expect(screen.queryByText("kg")).toBeNull();
      expect(screen.queryByText("lista_voluntarios")).toBeNull();
    });

    // Domain labels SHOULD be visible
    expect(screen.getByText("Raciones servidas")).toBeInTheDocument();
    expect(screen.getByText("Incidencias")).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 2 — SesionAsistenciaBlock QR-not-enrolled shows enroll prompt
// ═══════════════════════════════════════════════════════════════════════════

describe("SesionAsistenciaBlock — QR not-enrolled shows enroll prompt", () => {
  it("shows enroll prompt when marcarAsistenciaSesion returns BAD_REQUEST not-enrolled", async () => {
    mockUseMutationMarcar.mockImplementation(({ onError }: { onError?: (e: unknown) => void }) => ({
      mutate: (_input: unknown) => {
        onError?.({
          data: { code: "BAD_REQUEST" },
          message: "No inscrito en este curso",
        });
      },
      isPending: false,
      variables: undefined,
    }));

    const { SesionAsistenciaBlock } = await import("../components/sessions/SesionAsistenciaBlock");
    renderWithRouter(
      <SesionAsistenciaBlock
        sessionId="sess-1"
        programId="prog-1"
        programName="Curso Test"
        isAdmin={true}
      />
    );

    // Click the scan button to show QRScanner (mocked)
    const scanBtn = screen.getByRole("button", { name: /escanear qr/i });
    await userEvent.click(scanBtn);

    // Click the mock scanner's "Simulate scan" button to trigger a decoded QR
    // The mocked mutation fires onError immediately with BAD_REQUEST
    const simulateBtn = screen.getByRole("button", { name: /simulate scan/i });
    await userEvent.click(simulateBtn);

    // The not-enrolled error state should now be shown
    await waitFor(() => {
      const enrollPrompt =
        screen.queryByText(/no está inscrita/i) ??
        screen.queryByText(/no inscrito/i) ??
        screen.queryByText(/inscribir en el programa/i);
      expect(enrollPrompt).not.toBeNull();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 3 — ComplianceDashboard renders N/M + ausencia flags
//   (component-level test; in production this component is mounted from the
//    Dashboard page via SessionCompliancePanel when an inscribible edition is
//    selected — not from ProgramTabs/ProgramaDetalle)
// ═══════════════════════════════════════════════════════════════════════════

describe("ComplianceDashboard — renders N/M totals and absence alerts (mounted by Dashboard for selected edition)", () => {
  it("displays plan upload progress and pending sessions", async () => {
    mockGetCompliance.mockReturnValue({
      isLoading: false,
      data: {
        totalSesiones: 10,
        sesionesCerradas: 7,
        planosSubidos: 5,
        sesionesPendientesCount: 3,
        sesionesPendientes: [
          { id: "s1", fecha: "2026-06-01", hora_fin: "10:00" },
          { id: "s2", fecha: "2026-06-08", hora_fin: "10:00" },
          { id: "s3", fecha: "2026-06-15", hora_fin: "10:00" },
        ],
        ausenciasAlerta: [
          { personId: "p1", nombre: "Ana", apellidos: "García", consecutiveAbsences: 3 },
        ],
      },
    });

    const { ComplianceDashboard } = await import("../components/sessions/ComplianceDashboard");
    renderWithRouter(<ComplianceDashboard programId="prog-1" />);

    await waitFor(() => {
      // Progress text N/M
      expect(screen.getByText(/5.*10|5 de 10/i)).toBeInTheDocument();
    });

    // Absence alert chip for Ana
    expect(screen.getByText(/Ana/i)).toBeInTheDocument();
    // Alert count
    expect(screen.getByText(/3 falt/i)).toBeInTheDocument();

    // Pending sessions section header should mention 3 sessions
    expect(screen.getByText(/Sesiones pendientes de cierre/i)).toBeInTheDocument();
    const pendingBadge = screen.getByText(/\(3\)/i);
    expect(pendingBadge).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 4 — EnlaceSessionView shows error on bad token
// ═══════════════════════════════════════════════════════════════════════════

describe("EnlaceSessionView — shows error on bad/expired token", () => {
  it("renders a friendly error screen when enlaceGetSession returns FORBIDDEN", async () => {
    mockUseMutationEnlace.mockImplementation(({ onError }: { onError?: (e: unknown) => void }) => ({
      mutate: (_input: unknown) => {
        onError?.({
          data: { code: "FORBIDDEN" },
          message: "El enlace ha expirado",
        });
      },
      isPending: false,
      data: undefined,
      isError: false,
    }));

    const { EnlaceSessionView } = await import("../components/sessions/EnlaceSessionView");
    renderWithRouter(
      <EnlaceSessionView sessionId="sess-1" token="bad-token" />
    );

    await waitFor(() => {
      const errText =
        screen.queryByText(/enlace no válido/i) ??
        screen.queryByText(/caducado/i) ??
        screen.queryByText(/inválido/i) ??
        screen.queryByText(/expirado/i) ??
        screen.queryByText(/El enlace ha expirado/i);
      expect(errText).not.toBeNull();
    });
  });

  it("does not show any admin chrome (nav, login button)", async () => {
    mockUseMutationEnlace.mockImplementation(({ onError }: { onError?: (e: unknown) => void }) => ({
      mutate: (_input: unknown) => {
        onError?.({
          data: { code: "FORBIDDEN" },
          message: "Token inválido",
        });
      },
      isPending: false,
      data: undefined,
      isError: false,
    }));

    const { EnlaceSessionView } = await import("../components/sessions/EnlaceSessionView");
    renderWithRouter(
      <EnlaceSessionView sessionId="sess-1" token="bad-token" />
    );

    await waitFor(() => {
      expect(screen.queryByRole("navigation")).toBeNull();
      expect(screen.queryByRole("link", { name: /iniciar sesión/i })).toBeNull();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 6 — EnlaceSessionView renders the close form from the config that
// arrives WITH enlaceGetSession (regression: getCloseConfig is authed and
// unreachable on the public page, so the config MUST come in the mutation
// result — otherwise the teacher sees no fields yet enlaceCerrar then rejects).
// ═══════════════════════════════════════════════════════════════════════════

describe("EnlaceSessionView — renders close form from enlaceGetSession config", () => {
  it("shows the cierre fields when the returned closeConfig is enabled on an open session", async () => {
    mockUseMutationEnlace.mockImplementation(({ onSuccess }: { onSuccess?: (d: unknown) => void }) => ({
      mutate: (_input: unknown) => {
        onSuccess?.({
          session: { id: "sess-1", fecha: "2026-07-27", estado: "abierta", location_id: "loc-1" },
          persons: [{ id: "p1", nombre: "Ana", apellidos: "García" }],
          closeConfig: {
            enabled: true,
            tema_obligatorio: false,
            fields: [
              { slug: "raciones", label: "Raciones servidas", tipo: "numero", obligatorio: true },
            ],
            uploads: [],
          },
        });
      },
      isPending: false,
      data: undefined,
      isError: false,
    }));

    const { EnlaceSessionView } = await import("../components/sessions/EnlaceSessionView");
    renderWithRouter(<EnlaceSessionView sessionId="sess-1" token="good-token" />);

    // The close-form field label from the config must be visible — proving the
    // form is driven by the config delivered through enlaceGetSession.
    await waitFor(() => {
      expect(screen.getByText("Raciones servidas")).toBeInTheDocument();
    });
    // And the roster still renders (nombre+apellidos only).
    expect(screen.getByText("Ana García")).toBeInTheDocument();
  });
});
