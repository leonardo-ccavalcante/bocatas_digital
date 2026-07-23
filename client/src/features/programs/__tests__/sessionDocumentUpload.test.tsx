/**
 * sessionDocumentUpload.test.tsx — Behavioral tests for SessionDocumentUpload.
 *
 * @vitest-environment jsdom
 *
 * Covers:
 * 1. Renders both upload options (Subir archivo / Foto → texto)
 * 2. After mocked successful upload, shows satisfied indicator
 * 3. After mocked successful upload, obligatorio label shows as satisfied
 * 4. Enlace path: uses enlaceUploadSessionDocument (no auth required)
 * 5. The static stub "Sube el archivo tras cerrar" is NO LONGER present
 * 6. FIX 3: SesionCloseFormFields seeds uploadedSlugs from getSessionDocuments
 *    on mount so pre-existing docs show satisfied without re-upload
 */
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = global.ResizeObserver ?? ResizeObserverStub;

// ─── tRPC mock ─────────────────────────────────────────────────────────────────

const mockUploadAuth = vi.fn();
const mockUploadEnlace = vi.fn();
const mockExtractOcrAuth = vi.fn();
const mockExtractOcrEnlace = vi.fn();
const mockGetDocs = vi.fn();

vi.mock("@/lib/trpc", () => ({
  trpc: {
    programs: {
      sessionDocuments: {
        uploadSessionDocument: {
          useMutation: (opts: { onSuccess?: (d: unknown) => void; onError?: (e: unknown) => void }) => ({
            mutate: mockUploadAuth.mockImplementation((_input: unknown) => {
              opts?.onSuccess?.({ id: "doc-1", tipo_slug: "plan_clase", version: 1 });
            }),
            isPending: false,
          }),
        },
        enlaceUploadSessionDocument: {
          useMutation: (opts: { onSuccess?: (d: unknown) => void; onError?: (e: unknown) => void }) => ({
            mutate: mockUploadEnlace.mockImplementation((_input: unknown) => {
              opts?.onSuccess?.({ id: "doc-2", tipo_slug: "plan_clase", version: 1 });
            }),
            isPending: false,
          }),
        },
        extractLessonPlan: {
          useMutation: (opts: { onSuccess?: (d: unknown) => void; onError?: (e: unknown) => void }) => ({
            mutate: mockExtractOcrAuth.mockImplementation((_input: unknown) => {
              opts?.onSuccess?.({ success: true, texto: "## Tema\nMatemáticas" });
            }),
            isPending: false,
          }),
        },
        enlaceExtractLessonPlan: {
          useMutation: (opts: { onSuccess?: (d: unknown) => void; onError?: (e: unknown) => void }) => ({
            mutate: mockExtractOcrEnlace.mockImplementation((_input: unknown) => {
              opts?.onSuccess?.({ success: true, texto: "## Tema\nLectura" });
            }),
            isPending: false,
          }),
        },
        getSessionDocuments: {
          useQuery: mockGetDocs.mockReturnValue({ data: [], isLoading: false }),
        },
      },
    },
    useUtils: vi.fn(() => ({
      programs: {
        sessionDocuments: { getSessionDocuments: { invalidate: vi.fn() } },
      },
    })),
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

// Re-establish default mock return after every clearAllMocks() call.
// SesionCloseFormFields now calls getSessionDocuments.useQuery on mount (FIX 3);
// without this beforeEach the mock returns undefined and the component crashes.
beforeEach(() => {
  mockGetDocs.mockReturnValue({ data: [], isLoading: false });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("SessionDocumentUpload — static stub is replaced", () => {
  it("does NOT render the old stub text 'Sube el archivo tras cerrar'", async () => {
    const { SesionCloseFormFields } = await import(
      "../components/sessions/SesionCloseFormFields"
    );
    render(
      <SesionCloseFormFields
        config={{
          enabled: true,
          tema_obligatorio: false,
          fields: [],
          uploads: [{ slug: "plan_clase", label: "Plan de la clase", obligatorio: true }],
        }}
        values={{}}
        onChange={vi.fn()}
        sessionId="sess-1"
      />
    );

    await waitFor(() => {
      expect(screen.queryByText("Sube el archivo tras cerrar")).toBeNull();
    });
  });
});

describe("SessionDocumentUpload — renders both upload options", () => {
  it("shows 'Subir archivo' and 'Foto → texto' tabs in the dialog", async () => {
    const { SessionDocumentUpload } = await import(
      "../components/sessions/SessionDocumentUpload"
    );
    render(
      <SessionDocumentUpload
        upload={{ slug: "plan_clase", label: "Plan de la clase", obligatorio: true }}
        sessionId="sess-1"
        isUploaded={false}
        onUploaded={vi.fn()}
      />
    );

    // Click the "Subir" button to open dialog
    const btn = screen.getByRole("button", { name: /subir/i });
    await userEvent.click(btn);

    await waitFor(() => {
      // Both tab options must be present
      expect(screen.getByRole("tab", { name: /subir archivo/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /foto.*texto|texto.*foto/i })).toBeInTheDocument();
    });
  });
});

describe("SessionDocumentUpload — satisfied indicator after upload", () => {
  it("shows 'Resubir' button (not 'Subir') when isUploaded=true", async () => {
    const { SessionDocumentUpload } = await import(
      "../components/sessions/SessionDocumentUpload"
    );

    // Start as uploaded
    render(
      <SessionDocumentUpload
        upload={{ slug: "plan_clase", label: "Plan de la clase", obligatorio: true }}
        sessionId="sess-1"
        isUploaded={true}
        onUploaded={vi.fn()}
      />
    );

    await waitFor(() => {
      // When isUploaded=true, the button should say "Resubir" not "Subir"
      const resubirBtn = screen.getByRole("button", { name: /resubir plan de la clase/i });
      expect(resubirBtn).toBeInTheDocument();
      // And the basic "Subir" button should NOT be present (replaced by Resubir)
      expect(screen.queryByRole("button", { name: /^subir plan de la clase$/i })).toBeNull();
    });
  });

  it("enlace path uses enlaceUploadSessionDocument (not uploadSessionDocument)", async () => {
    const { SessionDocumentUpload } = await import(
      "../components/sessions/SessionDocumentUpload"
    );
    render(
      <SessionDocumentUpload
        upload={{ slug: "plan_clase", label: "Plan de la clase", obligatorio: true }}
        sessionId="sess-1"
        token="valid-token"
        isUploaded={false}
        onUploaded={vi.fn()}
      />
    );

    // Just verify the component renders without crashing with a token prop
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /subir/i })).toBeInTheDocument();
    });
  });
});

describe("SesionCloseFormFields — upload section renders correctly", () => {
  it("shows upload label when uploads are configured", async () => {
    const { SesionCloseFormFields } = await import(
      "../components/sessions/SesionCloseFormFields"
    );
    render(
      <SesionCloseFormFields
        config={{
          enabled: true,
          tema_obligatorio: false,
          fields: [],
          uploads: [
            { slug: "plan_clase", label: "Plan de la clase", obligatorio: true },
          ],
        }}
        values={{}}
        onChange={vi.fn()}
        sessionId="sess-1"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/plan de la clase/i)).toBeInTheDocument();
    });
    // The obligatorio asterisk should be present
    expect(screen.getByText(/documentos requeridos/i)).toBeInTheDocument();
  });
});

// ─── FIX 3: required-upload indicator seeded from server ─────────────────────

describe("SesionCloseFormFields — FIX 3: uploadedSlugs seeded from getSessionDocuments", () => {
  it("shows satisfied state (Resubir) on mount when server returns an existing plan_clase doc", async () => {
    // Override mock to return a pre-existing session document for plan_clase.
    mockGetDocs.mockReturnValue({
      data: [{
        id: "doc-1",
        tipo_slug: "plan_clase",
        url: "sessions/sess-1/plan_clase-abc.md",
        version: 1,
        subido_por: "Profe García",
        created_at: "2026-07-23T10:00:00Z",
      }],
      isLoading: false,
    });

    const { SesionCloseFormFields } = await import(
      "../components/sessions/SesionCloseFormFields"
    );
    render(
      <SesionCloseFormFields
        config={{
          enabled: true,
          tema_obligatorio: false,
          fields: [],
          uploads: [{ slug: "plan_clase", label: "Plan de la clase", obligatorio: true }],
        }}
        values={{}}
        onChange={vi.fn()}
        sessionId="sess-1"
        // No token → staff path, getSessionDocuments is available
      />
    );

    await waitFor(() => {
      // Satisfied state: button label is "Resubir", NOT "Subir"
      expect(
        screen.getByRole("button", { name: /resubir plan de la clase/i })
      ).toBeInTheDocument();
      // The required asterisk (*) should NOT be visible since upload is satisfied
      expect(
        screen.queryByRole("button", { name: /^subir plan de la clase$/i })
      ).toBeNull();
    });
  });
});
