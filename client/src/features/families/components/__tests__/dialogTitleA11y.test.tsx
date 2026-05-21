/** @vitest-environment jsdom */
/**
 * Regression: the shared DialogContent rendered an UNCONDITIONAL sr-only
 * <DialogPrimitive.Title/> fallback. When children also supply a real
 * <DialogTitle>, both share Radix's single titleId → duplicate id, and the
 * empty fallback (rendered first) won the accessible-name computation, leaving
 * every titled dialog with an empty accessible name (WCAG break + broke
 * getByRole("dialog", { name }) queries, e.g. SavedViewsBar test 12).
 * Found by /qa integration review on 2026-05-21.
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

describe("DialogContent accessible name (shared ui)", () => {
  it("uses the provided DialogTitle (nested in DialogHeader) as the accessible name", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Guardar filtros como vista</DialogTitle>
            <DialogDescription>Descripción</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
    expect(
      screen.getByRole("dialog", { name: "Guardar filtros como vista" })
    ).toBeInTheDocument();
  });

  it("still renders a dialog (sr-only fallback) when no title is provided", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogDescription>Sin título explícito</DialogDescription>
        </DialogContent>
      </Dialog>
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
