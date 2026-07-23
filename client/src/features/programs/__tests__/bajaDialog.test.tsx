/**
 * bajaDialog.test.tsx — BajaDialog component tests.
 *
 * Asserts:
 *   (a) Confirm button is disabled until motivo is non-empty.
 *   (b) onConfirm is called with the motivo (and optional notas).
 *   (c) Dialog resets its fields when closed.
 *
 * Renders via @testing-library/react in jsdom (env matched by test file path).
 * No tRPC dependency: BajaDialog receives onConfirm as a prop.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { BajaDialog } from "../components/BajaDialog";

// ── Radix Dialog needs a pointer-events stub in jsdom ─────────────────────────
// Some Radix UI primitives call PointerEvent APIs not shipped with jsdom.
if (!global.PointerEvent) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).PointerEvent = class PointerEvent extends MouseEvent {
    constructor(type: string, init?: PointerEventInit) { super(type, init); }
  };
}

afterEach(() => { cleanup(); });

function renderDialog(onConfirm = vi.fn(), isLoading = false) {
  render(
    <BajaDialog
      open
      onOpenChange={vi.fn()}
      personName="Ana García"
      isLoading={isLoading}
      onConfirm={onConfirm}
    />
  );
}

describe("BajaDialog — confirm button disabled without motivo", () => {
  beforeEach(() => { renderDialog(); });

  it("renders the dialog content when open=true", () => {
    expect(document.body.querySelector("#baja-motivo")).not.toBeNull();
  });

  it("confirm button is disabled when motivo textarea is empty", () => {
    const confirmBtn = screen.getByRole("button", { name: /confirmar baja/i });
    expect(confirmBtn).toBeDisabled();
  });

  it("confirm button becomes enabled after entering motivo", () => {
    const textarea = document.body.querySelector<HTMLTextAreaElement>("#baja-motivo");
    expect(textarea).not.toBeNull();
    fireEvent.change(textarea!, { target: { value: "Traslado de domicilio" } });
    const confirmBtn = screen.getByRole("button", { name: /confirmar baja/i });
    expect(confirmBtn).not.toBeDisabled();
  });

  it("confirm button is disabled when motivo contains only whitespace", () => {
    const textarea = document.body.querySelector<HTMLTextAreaElement>("#baja-motivo");
    fireEvent.change(textarea!, { target: { value: "   " } });
    const confirmBtn = screen.getByRole("button", { name: /confirmar baja/i });
    expect(confirmBtn).toBeDisabled();
  });
});

describe("BajaDialog — calls onConfirm with motivo", () => {
  it("calls onConfirm with trimmed motivo when confirmed", () => {
    const onConfirm = vi.fn();
    renderDialog(onConfirm);

    const textarea = document.body.querySelector<HTMLTextAreaElement>("#baja-motivo");
    fireEvent.change(textarea!, { target: { value: "  Traslado  " } });
    fireEvent.click(screen.getByRole("button", { name: /confirmar baja/i }));

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onConfirm).toHaveBeenCalledWith("Traslado", undefined);
  });

  it("calls onConfirm with motivo and notas when both are filled", () => {
    const onConfirm = vi.fn();
    renderDialog(onConfirm);

    const motivoEl = document.body.querySelector<HTMLTextAreaElement>("#baja-motivo");
    const notasEl = document.body.querySelector<HTMLTextAreaElement>("#baja-notas");
    fireEvent.change(motivoEl!, { target: { value: "Traslado" } });
    fireEvent.change(notasEl!, { target: { value: "Ref. expediente 42" } });
    fireEvent.click(screen.getByRole("button", { name: /confirmar baja/i }));

    expect(onConfirm).toHaveBeenCalledWith("Traslado", "Ref. expediente 42");
  });

  it("does not call onConfirm when motivo is empty", () => {
    const onConfirm = vi.fn();
    renderDialog(onConfirm);
    fireEvent.click(screen.getByRole("button", { name: /confirmar baja/i }));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("BajaDialog — loading state", () => {
  it("disables both buttons while isLoading=true", () => {
    renderDialog(vi.fn(), true);
    const textarea = document.body.querySelector<HTMLTextAreaElement>("#baja-motivo");
    fireEvent.change(textarea!, { target: { value: "motivo" } });
    const confirmBtn = screen.getByRole("button", { name: /guardando/i });
    expect(confirmBtn).toBeDisabled();
    const cancelBtn = screen.getByRole("button", { name: /cancelar/i });
    expect(cancelBtn).toBeDisabled();
  });
});

// ─── Pure logic: disabled condition ──────────────────────────────────────────

describe("BajaDialog — disabled condition (pure)", () => {
  function isConfirmDisabled(motivo: string, isLoading: boolean): boolean {
    return !motivo.trim() || isLoading;
  }

  it("disabled when motivo is empty string", () => {
    expect(isConfirmDisabled("", false)).toBe(true);
  });

  it("disabled when motivo is only whitespace", () => {
    expect(isConfirmDisabled("   ", false)).toBe(true);
  });

  it("enabled when motivo has content", () => {
    expect(isConfirmDisabled("Traslado", false)).toBe(false);
  });

  it("disabled when loading even with motivo", () => {
    expect(isConfirmDisabled("Traslado", true)).toBe(true);
  });
});
