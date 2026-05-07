/**
 * Contract-first tests for <ProgramaTiposDocumentoPage />.
 *
 * Spec source: CLAUDE.md Phase 1 Task 15.
 * Branch: feat/programa-familia-5-tab-surface
 *
 * Iron Law: these tests define the contract. Fix the component, never the test.
 */

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── wouter mock ───────────────────────────────────────────────────────────────
vi.mock("wouter", async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const real = await vi.importActual<typeof import("wouter")>("wouter");
  return {
    ...real,
    useParams: () => ({ slug: "programa_familias" }),
    Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
      <a href={href}>{children}</a>
    ),
  };
});

// ── Hoisted mock factories ────────────────────────────────────────────────────
const {
  mockGetBySlugUseQuery,
  mockListUseQuery,
  mockUpdateMutateAsync,
  mockCreateMutateAsync,
  mockRegisterUploadMutateAsync,
  mockStorageUpload,
  mockInvalidate,
} = vi.hoisted(() => ({
  mockGetBySlugUseQuery: vi.fn(),
  mockListUseQuery: vi.fn(),
  mockUpdateMutateAsync: vi.fn(),
  mockCreateMutateAsync: vi.fn(),
  mockRegisterUploadMutateAsync: vi.fn(),
  mockStorageUpload: vi.fn(),
  mockInvalidate: vi.fn(),
}));

// ── tRPC mock ─────────────────────────────────────────────────────────────────
vi.mock("@/lib/trpc", () => ({
  trpc: {
    programs: {
      getBySlug: { useQuery: mockGetBySlugUseQuery },
    },
    programDocumentTypes: {
      list: { useQuery: mockListUseQuery },
      update: {
        useMutation: () => ({
          mutateAsync: mockUpdateMutateAsync,
          isPending: false,
        }),
      },
      create: {
        useMutation: () => ({
          mutateAsync: mockCreateMutateAsync,
          isPending: false,
        }),
      },
      registerUpload: {
        useMutation: () => ({
          mutateAsync: mockRegisterUploadMutateAsync,
          isPending: false,
        }),
      },
    },
    useUtils: () => ({
      programDocumentTypes: {
        list: { invalidate: mockInvalidate },
      },
    }),
  },
}));

// ── Supabase Storage mock ─────────────────────────────────────────────────────
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    storage: {
      from: vi.fn(() => ({
        upload: mockStorageUpload,
      })),
    },
  }),
}));

// ── Sonner mock ───────────────────────────────────────────────────────────────
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// Import AFTER all mocks are registered.
import { ProgramaTiposDocumentoPage } from "../ProgramaTiposDocumentoPage";

// ── Fixtures ──────────────────────────────────────────────────────────────────
const program = {
  id: "prog-uuid-0001",
  slug: "programa_familias",
  name: "Programa de Familia",
};

const activeType = {
  id: "t1",
  programa_id: "prog-uuid-0001",
  slug: "padron_municipal",
  nombre: "Padrón municipal",
  descripcion: "Documento oficial",
  scope: "familia" as const,
  is_required: true,
  is_active: true,
  display_order: 10,
  template_url: null,
  template_filename: null,
  template_version: null,
  guide_url: null,
  guide_filename: null,
  guide_version: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const inactiveType = {
  ...activeType,
  id: "t2",
  slug: "documento_identidad",
  nombre: "Documento de identidad",
  is_active: false,
  is_required: false,
  display_order: 20,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function renderPage() {
  return render(<ProgramaTiposDocumentoPage />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("ProgramaTiposDocumentoPage", () => {
  // 1 ──────────────────────────────────────────────────────────────────────────
  it("renders 'Tipos de documento — Programa de Familia' title when program loaded", async () => {
    mockGetBySlugUseQuery.mockReturnValue({ data: program, isLoading: false, error: null });
    mockListUseQuery.mockReturnValue({ data: [], isLoading: false });

    renderPage();

    await waitFor(() => {
      expect(
        screen.getByText(/Tipos de documento — Programa de Familia/i),
      ).toBeInTheDocument();
    });
  });

  // 2 ──────────────────────────────────────────────────────────────────────────
  it("renders 'Programa no encontrado' on getBySlug error", async () => {
    mockGetBySlugUseQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: { message: "Not found" },
    });
    mockListUseQuery.mockReturnValue({ data: [], isLoading: false });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Programa no encontrado/i)).toBeInTheDocument();
    });
  });

  // 3 ──────────────────────────────────────────────────────────────────────────
  it("renders skeletons while program is loading", () => {
    mockGetBySlugUseQuery.mockReturnValue({ data: undefined, isLoading: true, error: null });
    mockListUseQuery.mockReturnValue({ data: undefined, isLoading: true });

    renderPage();

    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
  });

  // 4 ──────────────────────────────────────────────────────────────────────────
  it("passes includeInactive=true to programDocumentTypes.list", async () => {
    mockGetBySlugUseQuery.mockReturnValue({ data: program, isLoading: false, error: null });
    mockListUseQuery.mockReturnValue({ data: [], isLoading: false });

    renderPage();

    await waitFor(() => {
      const calls = mockListUseQuery.mock.calls;
      const lastArgs = calls[calls.length - 1][0];
      expect(lastArgs).toMatchObject({
        programaId: "prog-uuid-0001",
        includeInactive: true,
      });
    });
  });

  // 5 ──────────────────────────────────────────────────────────────────────────
  it("lists active and inactive types with the right indicators", async () => {
    mockGetBySlugUseQuery.mockReturnValue({ data: program, isLoading: false, error: null });
    mockListUseQuery.mockReturnValue({
      data: [activeType, inactiveType],
      isLoading: false,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Padrón municipal")).toBeInTheDocument();
      expect(screen.getByText("Documento de identidad")).toBeInTheDocument();
    });

    // Inactive type row should have reduced opacity marker
    const inactiveRow = screen.getByText("Documento de identidad").closest("[data-inactive]");
    expect(inactiveRow).not.toBeNull();
  });

  // 6 ──────────────────────────────────────────────────────────────────────────
  it("toggling the active Switch calls update mutation with { id, isActive: !current }", async () => {
    const user = userEvent.setup();
    mockGetBySlugUseQuery.mockReturnValue({ data: program, isLoading: false, error: null });
    mockListUseQuery.mockReturnValue({ data: [activeType], isLoading: false });
    mockUpdateMutateAsync.mockResolvedValue({});

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Padrón municipal")).toBeInTheDocument();
    });

    const toggle = screen.getByRole("switch", {
      name: /Activar\/desactivar Padrón municipal/i,
    });
    await user.click(toggle);

    expect(mockUpdateMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ id: "t1", isActive: false }),
    );
  });

  // 7 ──────────────────────────────────────────────────────────────────────────
  it("'Añadir tipo' form's Crear button is disabled when slug or nombre is empty", async () => {
    mockGetBySlugUseQuery.mockReturnValue({ data: program, isLoading: false, error: null });
    mockListUseQuery.mockReturnValue({ data: [], isLoading: false });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Añadir tipo/i)).toBeInTheDocument();
    });

    const crearBtn = screen.getByRole("button", { name: /Crear/i });
    expect(crearBtn).toBeDisabled();
  });

  // 8 ──────────────────────────────────────────────────────────────────────────
  it("Crear button is disabled when slug fails the snake_case regex", async () => {
    const user = userEvent.setup();
    mockGetBySlugUseQuery.mockReturnValue({ data: program, isLoading: false, error: null });
    mockListUseQuery.mockReturnValue({ data: [], isLoading: false });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Añadir tipo/i)).toBeInTheDocument();
    });

    const slugInput = screen.getByPlaceholderText(/slug/i);
    const nombreInput = screen.getByPlaceholderText(/nombre del tipo/i);

    await user.type(slugInput, "Bad Slug");
    await user.type(nombreInput, "Valid nombre");

    const crearBtn = screen.getByRole("button", { name: /Crear/i });
    expect(crearBtn).toBeDisabled();
  });

  // 9 ──────────────────────────────────────────────────────────────────────────
  it("Crear button calls create mutation with the right payload", async () => {
    const user = userEvent.setup();
    mockGetBySlugUseQuery.mockReturnValue({ data: program, isLoading: false, error: null });
    mockListUseQuery.mockReturnValue({ data: [], isLoading: false });
    mockCreateMutateAsync.mockResolvedValue({ id: "new-t1", slug: "nuevo_tipo" });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Añadir tipo/i)).toBeInTheDocument();
    });

    const slugInput = screen.getByPlaceholderText(/slug/i);
    const nombreInput = screen.getByPlaceholderText(/nombre del tipo/i);

    await user.type(slugInput, "nuevo_tipo");
    await user.type(nombreInput, "Nuevo tipo");

    const crearBtn = screen.getByRole("button", { name: /Crear/i });
    await user.click(crearBtn);

    expect(mockCreateMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        programaId: "prog-uuid-0001",
        slug: "nuevo_tipo",
        nombre: "Nuevo tipo",
      }),
    );
  });

  // 10 ─────────────────────────────────────────────────────────────────────────
  it("Crear resets the form on success", async () => {
    const user = userEvent.setup();
    mockGetBySlugUseQuery.mockReturnValue({ data: program, isLoading: false, error: null });
    mockListUseQuery.mockReturnValue({ data: [], isLoading: false });
    mockCreateMutateAsync.mockResolvedValue({ id: "new-t1", slug: "nuevo_tipo" });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Añadir tipo/i)).toBeInTheDocument();
    });

    const slugInput = screen.getByPlaceholderText(/slug/i);
    const nombreInput = screen.getByPlaceholderText(/nombre del tipo/i);

    await user.type(slugInput, "nuevo_tipo");
    await user.type(nombreInput, "Nuevo tipo");
    await user.click(screen.getByRole("button", { name: /Crear/i }));

    await waitFor(() => {
      expect((slugInput as HTMLInputElement).value).toBe("");
      expect((nombreInput as HTMLInputElement).value).toBe("");
    });
  });

  // 11 ─────────────────────────────────────────────────────────────────────────
  it("clicking Edit opens the edit dialog with the type's current values pre-filled", async () => {
    const user = userEvent.setup();
    mockGetBySlugUseQuery.mockReturnValue({ data: program, isLoading: false, error: null });
    mockListUseQuery.mockReturnValue({ data: [activeType], isLoading: false });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Padrón municipal")).toBeInTheDocument();
    });

    const editBtn = screen.getByRole("button", { name: /Editar Padrón municipal/i });
    await user.click(editBtn);

    await waitFor(() => {
      const dialog = screen.getByRole("dialog");
      const nombreField = within(dialog).getByDisplayValue("Padrón municipal");
      expect(nombreField).toBeInTheDocument();
    });
  });

  // 12 ─────────────────────────────────────────────────────────────────────────
  it("Edit dialog Save button calls update with the diff", async () => {
    const user = userEvent.setup();
    mockGetBySlugUseQuery.mockReturnValue({ data: program, isLoading: false, error: null });
    mockListUseQuery.mockReturnValue({ data: [activeType], isLoading: false });
    mockUpdateMutateAsync.mockResolvedValue({});

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Padrón municipal")).toBeInTheDocument();
    });

    const editBtn = screen.getByRole("button", { name: /Editar Padrón municipal/i });
    await user.click(editBtn);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    const dialog = screen.getByRole("dialog");
    const nombreField = within(dialog).getByDisplayValue("Padrón municipal");
    await user.clear(nombreField);
    await user.type(nombreField, "Padrón actualizado");

    const saveBtn = within(dialog).getByRole("button", { name: /Guardar/i });
    await user.click(saveBtn);

    expect(mockUpdateMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ id: "t1", nombre: "Padrón actualizado" }),
    );
  });

  // 13 ─────────────────────────────────────────────────────────────────────────
  it("Edit dialog Cancel closes without mutating", async () => {
    const user = userEvent.setup();
    mockGetBySlugUseQuery.mockReturnValue({ data: program, isLoading: false, error: null });
    mockListUseQuery.mockReturnValue({ data: [activeType], isLoading: false });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Padrón municipal")).toBeInTheDocument();
    });

    const editBtn = screen.getByRole("button", { name: /Editar Padrón municipal/i });
    await user.click(editBtn);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    const dialog = screen.getByRole("dialog");
    const cancelBtn = within(dialog).getByRole("button", { name: /Cancelar/i });
    await user.click(cancelBtn);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    expect(mockUpdateMutateAsync).not.toHaveBeenCalled();
  });

  // 14 ─────────────────────────────────────────────────────────────────────────
  it("Edit dialog does NOT show slug or scope as editable fields", async () => {
    const user = userEvent.setup();
    mockGetBySlugUseQuery.mockReturnValue({ data: program, isLoading: false, error: null });
    mockListUseQuery.mockReturnValue({ data: [activeType], isLoading: false });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Padrón municipal")).toBeInTheDocument();
    });

    const editBtn = screen.getByRole("button", { name: /Editar Padrón municipal/i });
    await user.click(editBtn);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    const dialog = screen.getByRole("dialog");

    // slug input should NOT be in the dialog as an editable field
    const slugEditInput = within(dialog).queryByRole("textbox", { name: /slug/i });
    expect(slugEditInput).toBeNull();

    // scope selector should NOT be in the dialog as an editable field
    const scopeSelector = within(dialog).queryByRole("combobox", { name: /scope|ámbito/i });
    expect(scopeSelector).toBeNull();
  });

  // 15 ─────────────────────────────────────────────────────────────────────────
  it("clicking 'Subir plantilla' opens the upload dialog with kind=template context", async () => {
    const user = userEvent.setup();
    mockGetBySlugUseQuery.mockReturnValue({ data: program, isLoading: false, error: null });
    mockListUseQuery.mockReturnValue({ data: [activeType], isLoading: false });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Padrón municipal")).toBeInTheDocument();
    });

    const uploadBtn = screen.getByRole("button", {
      name: /Subir plantilla de Padrón municipal/i,
    });
    await user.click(uploadBtn);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    // The dialog should indicate "template" context
    expect(screen.getByRole("dialog")).toHaveTextContent(/plantilla/i);
  });

  // 16 ─────────────────────────────────────────────────────────────────────────
  it("Upload dialog requires file + version before Guardar enables", async () => {
    const user = userEvent.setup();
    mockGetBySlugUseQuery.mockReturnValue({ data: program, isLoading: false, error: null });
    mockListUseQuery.mockReturnValue({ data: [activeType], isLoading: false });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Padrón municipal")).toBeInTheDocument();
    });

    const uploadBtn = screen.getByRole("button", {
      name: /Subir plantilla de Padrón municipal/i,
    });
    await user.click(uploadBtn);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    const dialog = screen.getByRole("dialog");
    const guardarBtn = within(dialog).getByRole("button", { name: /Guardar/i });

    // No file and no version → disabled
    expect(guardarBtn).toBeDisabled();

    // Fill version but no file → still disabled
    const versionInput = within(dialog).getByPlaceholderText(/versión/i);
    await user.type(versionInput, "v1");
    expect(guardarBtn).toBeDisabled();
  });

  // 17 ─────────────────────────────────────────────────────────────────────────
  it("Guardar in upload dialog uploads to bucket then calls registerUpload with kind=template", async () => {
    const user = userEvent.setup();
    mockGetBySlugUseQuery.mockReturnValue({ data: program, isLoading: false, error: null });
    mockListUseQuery.mockReturnValue({ data: [activeType], isLoading: false });
    mockStorageUpload.mockResolvedValue({ data: { path: "programa_familias/padron_municipal/template/123-test.pdf" }, error: null });
    mockRegisterUploadMutateAsync.mockResolvedValue({});

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Padrón municipal")).toBeInTheDocument();
    });

    const uploadBtn = screen.getByRole("button", {
      name: /Subir plantilla de Padrón municipal/i,
    });
    await user.click(uploadBtn);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    const dialog = screen.getByRole("dialog");

    // Upload a file
    const fileInput = within(dialog).getByTestId("upload-file-input");
    const file = new File(["content"], "test.pdf", { type: "application/pdf" });
    await user.upload(fileInput, file);

    // Fill version
    const versionInput = within(dialog).getByPlaceholderText(/versión/i);
    await user.type(versionInput, "v1");

    const guardarBtn = within(dialog).getByRole("button", { name: /Guardar/i });
    expect(guardarBtn).not.toBeDisabled();
    await user.click(guardarBtn);

    await waitFor(() => {
      expect(mockStorageUpload).toHaveBeenCalled();
      expect(mockRegisterUploadMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          docTypeId: "t1",
          kind: "template",
          filename: "test.pdf",
          version: "v1",
        }),
      );
    });
  });

  // 18 ─────────────────────────────────────────────────────────────────────────
  it("Errors in upload (Storage or registerUpload) call toast.error", async () => {
    const user = userEvent.setup();
    mockGetBySlugUseQuery.mockReturnValue({ data: program, isLoading: false, error: null });
    mockListUseQuery.mockReturnValue({ data: [activeType], isLoading: false });
    mockStorageUpload.mockResolvedValue({ data: null, error: { message: "Storage error" } });

    const { toast } = await import("sonner");

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Padrón municipal")).toBeInTheDocument();
    });

    const uploadBtn = screen.getByRole("button", {
      name: /Subir plantilla de Padrón municipal/i,
    });
    await user.click(uploadBtn);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    const dialog = screen.getByRole("dialog");
    const fileInput = within(dialog).getByTestId("upload-file-input");
    const file = new File(["content"], "test.pdf", { type: "application/pdf" });
    await user.upload(fileInput, file);

    const versionInput = within(dialog).getByPlaceholderText(/versión/i);
    await user.type(versionInput, "v1");

    const guardarBtn = within(dialog).getByRole("button", { name: /Guardar/i });
    await user.click(guardarBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });

  // 19 ─────────────────────────────────────────────────────────────────────────
  it("successful upload calls toast.success and closes the dialog", async () => {
    const user = userEvent.setup();
    mockGetBySlugUseQuery.mockReturnValue({ data: program, isLoading: false, error: null });
    mockListUseQuery.mockReturnValue({ data: [activeType], isLoading: false });
    mockStorageUpload.mockResolvedValue({ data: { path: "programa_familias/padron_municipal/template/123-test.pdf" }, error: null });
    mockRegisterUploadMutateAsync.mockResolvedValue({});

    const { toast } = await import("sonner");

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Padrón municipal")).toBeInTheDocument();
    });

    const uploadBtn = screen.getByRole("button", {
      name: /Subir plantilla de Padrón municipal/i,
    });
    await user.click(uploadBtn);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    const dialog = screen.getByRole("dialog");
    const fileInput = within(dialog).getByTestId("upload-file-input");
    const file = new File(["content"], "test.pdf", { type: "application/pdf" });
    await user.upload(fileInput, file);

    const versionInput = within(dialog).getByPlaceholderText(/versión/i);
    await user.type(versionInput, "v1");

    const guardarBtn = within(dialog).getByRole("button", { name: /Guardar/i });
    await user.click(guardarBtn);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });
});
