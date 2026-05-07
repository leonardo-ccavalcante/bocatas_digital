/**
 * Contract-first tests for <ClassifyModal programaId docId currentTipo open onClose />.
 *
 * Spec source: Phase 1 plan Task 13b
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

// ── Hoisted mock factories ─────────────────────────────────────────────────────
const {
  mockDocTypesUseQuery,
  mockClassifyMutate,
  mockClassifyIsPending,
} = vi.hoisted(() => ({
  mockDocTypesUseQuery: vi.fn(),
  mockClassifyMutate: vi.fn(),
  mockClassifyIsPending: { value: false },
}));

// ── tRPC mock ──────────────────────────────────────────────────────────────────
vi.mock("@/lib/trpc", () => ({
  trpc: {
    programDocumentTypes: {
      list: { useQuery: mockDocTypesUseQuery },
    },
    families: {
      classifyDocument: {
        useMutation: vi.fn(() => ({
          mutateAsync: mockClassifyMutate,
          isPending: mockClassifyIsPending.value,
        })),
      },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Import AFTER mocks.
import { ClassifyModal } from "../ClassifyModal";

// ── Fixtures ──────────────────────────────────────────────────────────────────
const TIPO_PADRON = {
  id: "t1",
  slug: "padron_municipal",
  nombre: "Padrón municipal",
  scope: "familia",
  is_required: true,
};

const TIPO_DNI = {
  id: "t2",
  slug: "documento_identidad",
  nombre: "Documento de identidad",
  scope: "miembro",
  is_required: false,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function renderModal(props: {
  programaId?: string;
  docId?: string | null;
  currentTipo?: string | null;
  open?: boolean;
  onClose?: () => void;
} = {}) {
  const onClose = props.onClose ?? vi.fn();
  // Explicit undefined checks so callers can pass null intentionally.
  const docId = "docId" in props ? props.docId : "doc-1";
  const currentTipo = "currentTipo" in props ? props.currentTipo : "padron_municipal";
  return {
    onClose,
    ...render(
      <ClassifyModal
        programaId={props.programaId ?? "prog-1"}
        docId={docId ?? null}
        currentTipo={currentTipo ?? null}
        open={props.open ?? true}
        onClose={onClose}
      />
    ),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("ClassifyModal", () => {
  it("1. returns null/closed when docId is null", () => {
    mockDocTypesUseQuery.mockReturnValue({ data: [TIPO_PADRON], isLoading: false });
    renderModal({ docId: null, open: true });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("2. renders dialog when docId is set and open=true", () => {
    mockDocTypesUseQuery.mockReturnValue({ data: [TIPO_PADRON], isLoading: false });
    renderModal({ docId: "doc-1", open: true });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("3. Select pre-selects currentTipo — trigger text shows the tipo's nombre", () => {
    mockDocTypesUseQuery.mockReturnValue({ data: [TIPO_PADRON, TIPO_DNI], isLoading: false });
    renderModal({ currentTipo: "padron_municipal" });
    // The SelectTrigger should display the nombre of the currently selected tipo.
    expect(screen.getByRole("combobox", { name: /nuevo tipo/i })).toHaveTextContent("Padrón municipal");
  });

  it("4. Guardar is disabled when no tipo change", () => {
    mockDocTypesUseQuery.mockReturnValue({ data: [TIPO_PADRON], isLoading: false });
    renderModal({ currentTipo: "padron_municipal" });
    const guardar = screen.getByRole("button", { name: "Guardar" });
    expect(guardar).toBeDisabled();
  });

  it("5. picking a different tipo enables Guardar", async () => {
    mockDocTypesUseQuery.mockReturnValue({ data: [TIPO_PADRON, TIPO_DNI], isLoading: false });
    renderModal({ currentTipo: "padron_municipal" });

    const trigger = screen.getByRole("combobox", { name: /nuevo tipo/i });
    await userEvent.click(trigger);
    const option = await screen.findByText(/Documento de identidad/);
    await userEvent.click(option);

    const guardar = screen.getByRole("button", { name: "Guardar" });
    expect(guardar).not.toBeDisabled();
  });

  it("6. clicking Guardar calls classifyDocument with (docId, newTipo)", async () => {
    mockDocTypesUseQuery.mockReturnValue({ data: [TIPO_PADRON, TIPO_DNI], isLoading: false });
    mockClassifyMutate.mockResolvedValue({});
    renderModal({ docId: "doc-1", currentTipo: "padron_municipal" });

    const trigger = screen.getByRole("combobox", { name: /nuevo tipo/i });
    await userEvent.click(trigger);
    const option = await screen.findByText(/Documento de identidad/);
    await userEvent.click(option);

    const guardar = screen.getByRole("button", { name: "Guardar" });
    await userEvent.click(guardar);

    await waitFor(() => {
      expect(mockClassifyMutate).toHaveBeenCalledWith({
        docId: "doc-1",
        documentoTipo: "documento_identidad",
      });
    });
  });

  it("7. successful save calls toast.success and onClose", async () => {
    mockDocTypesUseQuery.mockReturnValue({ data: [TIPO_PADRON, TIPO_DNI], isLoading: false });
    mockClassifyMutate.mockResolvedValue({});
    const { toast } = await import("sonner");
    const onClose = vi.fn();
    render(
      <ClassifyModal
        programaId="prog-1"
        docId="doc-1"
        currentTipo="padron_municipal"
        open
        onClose={onClose}
      />
    );

    const trigger = screen.getByRole("combobox", { name: /nuevo tipo/i });
    await userEvent.click(trigger);
    const option = await screen.findByText(/Documento de identidad/);
    await userEvent.click(option);

    const guardar = screen.getByRole("button", { name: "Guardar" });
    await userEvent.click(guardar);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Documento reclasificado");
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("8. error in save calls toast.error and does NOT call onClose", async () => {
    mockDocTypesUseQuery.mockReturnValue({ data: [TIPO_PADRON, TIPO_DNI], isLoading: false });
    mockClassifyMutate.mockRejectedValue(new Error("Error de clasificación"));
    const { toast } = await import("sonner");
    const onClose = vi.fn();
    render(
      <ClassifyModal
        programaId="prog-1"
        docId="doc-1"
        currentTipo="padron_municipal"
        open
        onClose={onClose}
      />
    );

    const trigger = screen.getByRole("combobox", { name: /nuevo tipo/i });
    await userEvent.click(trigger);
    const option = await screen.findByText(/Documento de identidad/);
    await userEvent.click(option);

    const guardar = screen.getByRole("button", { name: "Guardar" });
    await userEvent.click(guardar);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining("Error de clasificación")
      );
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("9. Cancelar calls onClose without mutating", async () => {
    mockDocTypesUseQuery.mockReturnValue({ data: [TIPO_PADRON], isLoading: false });
    const { onClose } = renderModal();

    const cancelar = screen.getByRole("button", { name: "Cancelar" });
    await userEvent.click(cancelar);

    expect(onClose).toHaveBeenCalledOnce();
    expect(mockClassifyMutate).not.toHaveBeenCalled();
  });

  it("10. dialog has DialogDescription", () => {
    mockDocTypesUseQuery.mockReturnValue({ data: [TIPO_PADRON], isLoading: false });
    renderModal();
    // DialogDescription renders a <p> with role="none" by default;
    // check the dialog contains a description element.
    const dialog = screen.getByRole("dialog");
    // Radix renders the description as an element with id matching aria-describedby
    const describedById = dialog.getAttribute("aria-describedby");
    expect(describedById).toBeTruthy();
    const descEl = document.getElementById(describedById!);
    expect(descEl).toBeInTheDocument();
  });
});
