/**
 * Contract-first tests for <UploadModal programaId open onClose />.
 *
 * Spec source: Phase 1 plan Task 12
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

afterEach(cleanup);

// ── Hoisted mock factories ─────────────────────────────────────────────────────
const {
  mockDocTypesUseQuery,
  mockFamiliesGetAllUseQuery,
  mockFamiliesGetByIdUseQuery,
  mockUploadMutateAsync,
  mockDeleteMutateAsync,
  mockStorageUpload,
} = vi.hoisted(() => ({
  mockDocTypesUseQuery: vi.fn(),
  mockFamiliesGetAllUseQuery: vi.fn(),
  mockFamiliesGetByIdUseQuery: vi.fn(),
  mockUploadMutateAsync: vi.fn(),
  mockDeleteMutateAsync: vi.fn(),
  mockStorageUpload: vi.fn(),
}));

// ── tRPC mock ─────────────────────────────────────────────────────────────────
vi.mock("@/lib/trpc", () => ({
  trpc: {
    programDocumentTypes: {
      list: { useQuery: mockDocTypesUseQuery },
    },
    families: {
      getAll: { useQuery: mockFamiliesGetAllUseQuery },
      getById: { useQuery: mockFamiliesGetByIdUseQuery },
      uploadFamilyDocument: {
        useMutation: () => ({
          mutateAsync: mockUploadMutateAsync,
          isPending: false,
        }),
      },
      deleteFamilyDocument: {
        useMutation: () => ({
          mutateAsync: mockDeleteMutateAsync,
          isPending: false,
        }),
      },
      getFamilyDocuments: { invalidate: vi.fn() },
      getPendingItems: { invalidate: vi.fn() },
      getComplianceStats: { invalidate: vi.fn() },
    },
    useUtils: () => ({
      families: {
        getFamilyDocuments: { invalidate: vi.fn() },
        getById: { invalidate: vi.fn() },
        getPendingItems: { invalidate: vi.fn() },
        getComplianceStats: { invalidate: vi.fn() },
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

// ── sonner mock ───────────────────────────────────────────────────────────────
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Import AFTER mocks are registered.
import { UploadModal } from "../UploadModal";

// ── Fixtures ──────────────────────────────────────────────────────────────────
const FAMILIA_TYPE = {
  id: "t1",
  slug: "padron_municipal",
  nombre: "Padrón municipal",
  scope: "familia" as const,
  is_required: true,
};

const MIEMBRO_TYPE = {
  id: "t2",
  slug: "documento_identidad",
  nombre: "Documento de identidad",
  scope: "miembro" as const,
  is_required: false,
};

const OPTIONAL_FAMILIA_TYPE = {
  id: "t3",
  slug: "justificante_ingresos",
  nombre: "Justificante de ingresos",
  scope: "familia" as const,
  is_required: false,
};

const MOCK_FAMILIES = [
  { id: "f1", familia_numero: 42, persons: { id: "p1", nombre: "Ana", apellidos: "García" } },
  { id: "f2", familia_numero: 99, persons: { id: "p2", nombre: "Juan", apellidos: "López" } },
];

const MOCK_MIEMBROS = [
  { nombre: "Ana", apellidos: "García" },
  { nombre: "Pedro", apellidos: "García" },
];

// ── Default mock returns ───────────────────────────────────────────────────────
function setupDefaultMocks() {
  mockDocTypesUseQuery.mockReturnValue({ data: [FAMILIA_TYPE, MIEMBRO_TYPE], isLoading: false });
  mockFamiliesGetAllUseQuery.mockReturnValue({ data: [], isLoading: false });
  mockFamiliesGetByIdUseQuery.mockReturnValue({ data: null, isLoading: false });
  mockUploadMutateAsync.mockResolvedValue({ id: "doc-99" });
  mockDeleteMutateAsync.mockResolvedValue(undefined);
  mockStorageUpload.mockResolvedValue({ error: null });
}

// ── Helper ────────────────────────────────────────────────────────────────────
function renderModal(props: { open?: boolean; onClose?: () => void } = {}) {
  const onClose = props.onClose ?? vi.fn();
  const open = props.open ?? true;
  return {
    onClose,
    ...render(
      <UploadModal programaId="prog1" open={open} onClose={onClose} />
    ),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("UploadModal", () => {
  it("1. renders nothing when open=false", () => {
    setupDefaultMocks();
    renderModal({ open: false });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("2. renders dialog when open=true", () => {
    setupDefaultMocks();
    renderModal({ open: true });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("3. renders Tipo, Familia, and Archivo fields when open", () => {
    setupDefaultMocks();
    renderModal();
    expect(screen.getByText("Tipo de documento *")).toBeInTheDocument();
    expect(screen.getByLabelText("Buscar familia")).toBeInTheDocument();
    expect(screen.getByLabelText("Archivo *")).toBeInTheDocument();
  });

  it("4. Subir button is disabled initially", () => {
    setupDefaultMocks();
    renderModal();
    const btn = screen.getByRole("button", { name: "Subir" });
    expect(btn).toBeDisabled();
  });

  it("5. populates Tipo dropdown from useProgramDocumentTypes", async () => {
    mockDocTypesUseQuery.mockReturnValue({
      data: [FAMILIA_TYPE, MIEMBRO_TYPE, OPTIONAL_FAMILIA_TYPE],
      isLoading: false,
    });
    mockFamiliesGetAllUseQuery.mockReturnValue({ data: [], isLoading: false });
    mockFamiliesGetByIdUseQuery.mockReturnValue({ data: null, isLoading: false });

    renderModal();

    const trigger = screen.getByRole("combobox", { name: "Tipo de documento" });
    await userEvent.click(trigger);

    await waitFor(() => {
      // Padrón municipal — familia, obligatorio
      expect(screen.getByText(/Padrón municipal.*Por familia.*Obligatorio/)).toBeInTheDocument();
      // Documento de identidad — miembro, no obligatorio
      expect(screen.getByText(/Documento de identidad.*Por miembro/)).toBeInTheDocument();
      // Justificante de ingresos — familia, no obligatorio
      expect(screen.getByText(/Justificante de ingresos.*Por familia/)).toBeInTheDocument();
    });
  });

  it("6. selecting a miembro-scoped type does NOT show the Miembro picker until a family is also selected", async () => {
    setupDefaultMocks();
    renderModal();

    const trigger = screen.getByRole("combobox", { name: "Tipo de documento" });
    await userEvent.click(trigger);

    const option = await screen.findByText(/Documento de identidad/);
    await userEvent.click(option);

    // Miembro select should NOT be visible yet
    expect(screen.queryByRole("combobox", { name: "Miembro" })).toBeNull();
  });

  it("7. Familia search fires getAll query when search >= 2 chars", async () => {
    setupDefaultMocks();
    renderModal();

    const input = screen.getByLabelText("Buscar familia");
    await userEvent.type(input, "Ga");

    await waitFor(() => {
      expect(mockFamiliesGetAllUseQuery).toHaveBeenCalledWith(
        expect.objectContaining({ search: "Ga", estado: "all" }),
        expect.objectContaining({ enabled: true })
      );
    });
  });

  it("8. Familia search results render as clickable buttons", async () => {
    mockDocTypesUseQuery.mockReturnValue({ data: [FAMILIA_TYPE], isLoading: false });
    mockFamiliesGetByIdUseQuery.mockReturnValue({ data: null, isLoading: false });
    mockFamiliesGetAllUseQuery.mockImplementation((params: { search?: string; estado?: string }) => {
      if (params?.search && params.search.length >= 2) {
        return { data: MOCK_FAMILIES, isLoading: false };
      }
      return { data: [], isLoading: false };
    });

    renderModal();

    const input = screen.getByLabelText("Buscar familia");
    await userEvent.type(input, "An");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "#42 Ana García" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "#99 Juan López" })).toBeInTheDocument();
    });
  });

  it("9. clicking a Familia search result selects it", async () => {
    mockDocTypesUseQuery.mockReturnValue({ data: [FAMILIA_TYPE], isLoading: false });
    mockFamiliesGetByIdUseQuery.mockReturnValue({ data: null, isLoading: false });
    mockFamiliesGetAllUseQuery.mockImplementation((params: { search?: string; estado?: string }) => {
      if (params?.search && params.search.length >= 2) {
        return { data: MOCK_FAMILIES, isLoading: false };
      }
      return { data: [], isLoading: false };
    });

    renderModal();

    const input = screen.getByLabelText("Buscar familia");
    await userEvent.type(input, "An");

    const resultBtn = await screen.findByRole("button", { name: "#42 Ana García" });
    await userEvent.click(resultBtn);

    // Input should show the selected family
    expect((input as HTMLInputElement).value).toBe("#42 Ana García");
    // Dropdown should disappear
    expect(screen.queryByRole("button", { name: "#99 Juan López" })).toBeNull();
  });

  it("10. selecting a miembro-scoped type WITH a family populates the Miembro picker from family.miembros", async () => {
    mockDocTypesUseQuery.mockReturnValue({ data: [MIEMBRO_TYPE], isLoading: false });
    mockFamiliesGetAllUseQuery.mockImplementation((params: { search?: string; estado?: string }) => {
      if (params?.search && params.search.length >= 2) {
        return { data: MOCK_FAMILIES, isLoading: false };
      }
      return { data: [], isLoading: false };
    });
    mockFamiliesGetByIdUseQuery.mockReturnValue({
      data: { id: "f1", miembros: MOCK_MIEMBROS },
      isLoading: false,
    });

    renderModal();

    // Select miembro-scoped type
    const typeTrigger = screen.getByRole("combobox", { name: "Tipo de documento" });
    await userEvent.click(typeTrigger);
    const typeOption = await screen.findByText(/Documento de identidad/);
    await userEvent.click(typeOption);

    // Select a family
    const familiaInput = screen.getByLabelText("Buscar familia");
    await userEvent.type(familiaInput, "An");
    const familyBtn = await screen.findByRole("button", { name: "#42 Ana García" });
    await userEvent.click(familyBtn);

    // Now miembro picker should appear
    const miembroTrigger = await screen.findByRole("combobox", { name: "Miembro" });
    await userEvent.click(miembroTrigger);

    await waitFor(() => {
      expect(screen.getByText("Ana García")).toBeInTheDocument();
      expect(screen.getByText("Pedro García")).toBeInTheDocument();
    });
  });

  it("11. Subir button enables when type + family (+miembro if applicable) + file are all set", async () => {
    mockDocTypesUseQuery.mockReturnValue({ data: [FAMILIA_TYPE], isLoading: false });
    mockFamiliesGetAllUseQuery.mockImplementation((params: { search?: string; estado?: string }) => {
      if (params?.search && params.search.length >= 2) {
        return { data: MOCK_FAMILIES, isLoading: false };
      }
      return { data: [], isLoading: false };
    });
    mockFamiliesGetByIdUseQuery.mockReturnValue({ data: null, isLoading: false });

    renderModal();

    // Select type
    const typeTrigger = screen.getByRole("combobox", { name: "Tipo de documento" });
    await userEvent.click(typeTrigger);
    const typeOption = await screen.findByText(/Padrón municipal/);
    await userEvent.click(typeOption);

    // Select family
    const familiaInput = screen.getByLabelText("Buscar familia");
    await userEvent.type(familiaInput, "An");
    const familyBtn = await screen.findByRole("button", { name: "#42 Ana García" });
    await userEvent.click(familyBtn);

    // Attach file
    const fileInput = screen.getByLabelText("Archivo *");
    const file = new File(["hello"], "padron.pdf", { type: "application/pdf" });
    await userEvent.upload(fileInput, file);

    const subirBtn = screen.getByRole("button", { name: "Subir" });
    expect(subirBtn).not.toBeDisabled();
  });

  it("12. clicking Subir for a familia-scoped type calls uploadFamilyDocument with member_index=-1 and the right path", async () => {
    mockDocTypesUseQuery.mockReturnValue({ data: [FAMILIA_TYPE], isLoading: false });
    mockFamiliesGetAllUseQuery.mockImplementation((params: { search?: string; estado?: string }) => {
      if (params?.search && params.search.length >= 2) {
        return { data: MOCK_FAMILIES, isLoading: false };
      }
      return { data: [], isLoading: false };
    });
    mockFamiliesGetByIdUseQuery.mockReturnValue({ data: null, isLoading: false });
    mockUploadMutateAsync.mockResolvedValue({ id: "doc-42" });
    mockStorageUpload.mockResolvedValue({ error: null });

    renderModal();

    // Select type
    const typeTrigger = screen.getByRole("combobox", { name: "Tipo de documento" });
    await userEvent.click(typeTrigger);
    const typeOption = await screen.findByText(/Padrón municipal/);
    await userEvent.click(typeOption);

    // Select family
    const familiaInput = screen.getByLabelText("Buscar familia");
    await userEvent.type(familiaInput, "An");
    const familyBtn = await screen.findByRole("button", { name: "#42 Ana García" });
    await userEvent.click(familyBtn);

    // Attach file
    const fileInput = screen.getByLabelText("Archivo *");
    const file = new File(["content"], "padron.pdf", { type: "application/pdf" });
    await userEvent.upload(fileInput, file);

    const subirBtn = screen.getByRole("button", { name: "Subir" });
    await userEvent.click(subirBtn);

    await waitFor(() => {
      expect(mockUploadMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          family_id: "f1",
          member_index: -1,
          documento_tipo: "padron_municipal",
          documento_url: expect.stringMatching(/^f1\/-1\/padron_municipal\//),
        })
      );
    });
  });

  it("13. clicking Subir for a miembro-scoped type passes member_index = the chosen index", async () => {
    mockDocTypesUseQuery.mockReturnValue({ data: [MIEMBRO_TYPE], isLoading: false });
    mockFamiliesGetAllUseQuery.mockImplementation((params: { search?: string; estado?: string }) => {
      if (params?.search && params.search.length >= 2) {
        return { data: MOCK_FAMILIES, isLoading: false };
      }
      return { data: [], isLoading: false };
    });
    mockFamiliesGetByIdUseQuery.mockReturnValue({
      data: { id: "f1", miembros: MOCK_MIEMBROS },
      isLoading: false,
    });
    mockUploadMutateAsync.mockResolvedValue({ id: "doc-55" });
    mockStorageUpload.mockResolvedValue({ error: null });

    renderModal();

    // Select miembro type
    const typeTrigger = screen.getByRole("combobox", { name: "Tipo de documento" });
    await userEvent.click(typeTrigger);
    const typeOption = await screen.findByText(/Documento de identidad/);
    await userEvent.click(typeOption);

    // Select family
    const familiaInput = screen.getByLabelText("Buscar familia");
    await userEvent.type(familiaInput, "An");
    const familyBtn = await screen.findByRole("button", { name: "#42 Ana García" });
    await userEvent.click(familyBtn);

    // Select member at index 1 (Pedro García)
    const miembroTrigger = await screen.findByRole("combobox", { name: "Miembro" });
    await userEvent.click(miembroTrigger);
    const memberOption = await screen.findByText("Pedro García");
    await userEvent.click(memberOption);

    // Attach file
    const fileInput = screen.getByLabelText("Archivo *");
    const file = new File(["content"], "dni.pdf", { type: "application/pdf" });
    await userEvent.upload(fileInput, file);

    const subirBtn = screen.getByRole("button", { name: "Subir" });
    await userEvent.click(subirBtn);

    await waitFor(() => {
      expect(mockUploadMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          family_id: "f1",
          member_index: 1,
          documento_tipo: "documento_identidad",
        })
      );
    });
  });

  it("14. Subir uploads the file to Storage with the path returned by the DB row", async () => {
    mockDocTypesUseQuery.mockReturnValue({ data: [FAMILIA_TYPE], isLoading: false });
    mockFamiliesGetAllUseQuery.mockImplementation((params: { search?: string; estado?: string }) => {
      if (params?.search && params.search.length >= 2) {
        return { data: MOCK_FAMILIES, isLoading: false };
      }
      return { data: [], isLoading: false };
    });
    mockFamiliesGetByIdUseQuery.mockReturnValue({ data: null, isLoading: false });
    mockUploadMutateAsync.mockResolvedValue({ id: "doc-77" });
    mockStorageUpload.mockResolvedValue({ error: null });

    renderModal();

    // Select type
    const typeTrigger = screen.getByRole("combobox", { name: "Tipo de documento" });
    await userEvent.click(typeTrigger);
    const typeOption = await screen.findByText(/Padrón municipal/);
    await userEvent.click(typeOption);

    // Select family
    const familiaInput = screen.getByLabelText("Buscar familia");
    await userEvent.type(familiaInput, "An");
    const familyBtn = await screen.findByRole("button", { name: "#42 Ana García" });
    await userEvent.click(familyBtn);

    // Attach file
    const fileInput = screen.getByLabelText("Archivo *");
    const file = new File(["content"], "padron.pdf", { type: "application/pdf" });
    await userEvent.upload(fileInput, file);

    const subirBtn = screen.getByRole("button", { name: "Subir" });
    await userEvent.click(subirBtn);

    await waitFor(() => {
      expect(mockStorageUpload).toHaveBeenCalledWith(
        expect.stringMatching(/^f1\/-1\/padron_municipal\/.+\.pdf$/),
        file,
        expect.objectContaining({ contentType: "application/pdf", upsert: false })
      );
    });
  });

  it("15. if Storage upload fails, the DB row is soft-deleted via deleteFamilyDocument", async () => {
    mockDocTypesUseQuery.mockReturnValue({ data: [FAMILIA_TYPE], isLoading: false });
    mockFamiliesGetAllUseQuery.mockImplementation((params: { search?: string; estado?: string }) => {
      if (params?.search && params.search.length >= 2) {
        return { data: MOCK_FAMILIES, isLoading: false };
      }
      return { data: [], isLoading: false };
    });
    mockFamiliesGetByIdUseQuery.mockReturnValue({ data: null, isLoading: false });
    mockUploadMutateAsync.mockResolvedValue({ id: "doc-88" });
    mockStorageUpload.mockResolvedValue({ error: { message: "Storage error" } });
    mockDeleteMutateAsync.mockResolvedValue(undefined);

    renderModal();

    // Select type
    const typeTrigger = screen.getByRole("combobox", { name: "Tipo de documento" });
    await userEvent.click(typeTrigger);
    const typeOption = await screen.findByText(/Padrón municipal/);
    await userEvent.click(typeOption);

    // Select family
    const familiaInput = screen.getByLabelText("Buscar familia");
    await userEvent.type(familiaInput, "An");
    const familyBtn = await screen.findByRole("button", { name: "#42 Ana García" });
    await userEvent.click(familyBtn);

    // Attach file
    const fileInput = screen.getByLabelText("Archivo *");
    const file = new File(["content"], "padron.pdf", { type: "application/pdf" });
    await userEvent.upload(fileInput, file);

    const subirBtn = screen.getByRole("button", { name: "Subir" });
    await userEvent.click(subirBtn);

    await waitFor(() => {
      expect(mockDeleteMutateAsync).toHaveBeenCalledWith({ id: "doc-88" });
    });
  });

  it("16. Cancelar button calls onClose", async () => {
    setupDefaultMocks();
    const { onClose } = renderModal();

    const cancelBtn = screen.getByRole("button", { name: "Cancelar" });
    await userEvent.click(cancelBtn);

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("17. successful upload calls toast.success and onClose", async () => {
    mockDocTypesUseQuery.mockReturnValue({ data: [FAMILIA_TYPE], isLoading: false });
    mockFamiliesGetAllUseQuery.mockImplementation((params: { search?: string; estado?: string }) => {
      if (params?.search && params.search.length >= 2) {
        return { data: MOCK_FAMILIES, isLoading: false };
      }
      return { data: [], isLoading: false };
    });
    mockFamiliesGetByIdUseQuery.mockReturnValue({ data: null, isLoading: false });
    mockUploadMutateAsync.mockResolvedValue({ id: "doc-99" });
    mockStorageUpload.mockResolvedValue({ error: null });

    const { toast } = await import("sonner");
    const onClose = vi.fn();
    render(<UploadModal programaId="prog1" open onClose={onClose} />);

    // Select type
    const typeTrigger = screen.getByRole("combobox", { name: "Tipo de documento" });
    await userEvent.click(typeTrigger);
    const typeOption = await screen.findByText(/Padrón municipal/);
    await userEvent.click(typeOption);

    // Select family
    const familiaInput = screen.getByLabelText("Buscar familia");
    await userEvent.type(familiaInput, "An");
    const familyBtn = await screen.findByRole("button", { name: "#42 Ana García" });
    await userEvent.click(familyBtn);

    // Attach file
    const fileInput = screen.getByLabelText("Archivo *");
    const file = new File(["content"], "padron.pdf", { type: "application/pdf" });
    await userEvent.upload(fileInput, file);

    const subirBtn = screen.getByRole("button", { name: "Subir" });
    await userEvent.click(subirBtn);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("1 archivo"));
      expect(onClose).toHaveBeenCalledOnce();
    });
  });
});
