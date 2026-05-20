/**
 * DistritoPanel — RED test suite (TDD phase 1).
 *
 * Verifies: Sheet content, "Ver familias" CTA href, k-anon display,
 * and WCAG aria-label requirements.
 *
 * Iron Law: fix the implementation, never the test.
 */

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

afterEach(cleanup);

// jsdom stubs for Radix Dialog (used by Sheet)
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

import { DistritoPanel } from "../DistritoPanel";

import type { DistritoStatRow } from "../../../../../server/routers/mapa";

const CENTRO_ROW: DistritoStatRow = {
  distrito: "centro",
  count: 12,
  compliance: 0.83,
};

const SUPPRESSED_ROW: DistritoStatRow = {
  distrito: "vicalvaro",
  count: null,
};

function renderInRouter(ui: React.ReactElement, path = "/") {
  const { hook } = memoryLocation({ path });
  return render(<Router hook={hook}>{ui}</Router>);
}

describe("<DistritoPanel />", () => {
  it("renders nothing when open=false", () => {
    renderInRouter(
      <DistritoPanel
        open={false}
        onClose={vi.fn()}
        row={CENTRO_ROW}
        kAnonymityFloor={3}
        layer="densidad"
      />,
    );
    // Sheet with open=false should not show content in DOM
    expect(screen.queryByText("Centro")).not.toBeInTheDocument();
  });

  it("renders the distrito label when open=true", () => {
    renderInRouter(
      <DistritoPanel
        open
        onClose={vi.fn()}
        row={CENTRO_ROW}
        kAnonymityFloor={3}
        layer="densidad"
      />,
    );
    expect(screen.getByText("Centro")).toBeInTheDocument();
  });

  it("renders count for densidad layer", () => {
    renderInRouter(
      <DistritoPanel
        open
        onClose={vi.fn()}
        row={CENTRO_ROW}
        kAnonymityFloor={3}
        layer="densidad"
      />,
    );
    expect(screen.getByText(/12 familias/i)).toBeInTheDocument();
  });

  it("renders compliance percentage for compliance layer", () => {
    renderInRouter(
      <DistritoPanel
        open
        onClose={vi.fn()}
        row={CENTRO_ROW}
        kAnonymityFloor={3}
        layer="compliance"
      />,
    );
    expect(screen.getByText(/83%/)).toBeInTheDocument();
  });

  it("shows k-anon suppression message when count is null", () => {
    renderInRouter(
      <DistritoPanel
        open
        onClose={vi.fn()}
        row={SUPPRESSED_ROW}
        kAnonymityFloor={3}
        layer="densidad"
      />,
    );
    expect(screen.getByText(/<3 familias/i)).toBeInTheDocument();
  });

  it("'Ver familias' CTA href targets ?tab=familias&distrito=<slug>", () => {
    renderInRouter(
      <DistritoPanel
        open
        onClose={vi.fn()}
        row={CENTRO_ROW}
        kAnonymityFloor={3}
        layer="densidad"
      />,
    );
    const link = screen.getByRole("link", { name: /ver familias/i });
    expect(link).toHaveAttribute("href");
    const href = link.getAttribute("href") ?? "";
    expect(href).toContain("tab=familias");
    expect(href).toContain("distrito=centro");
  });

  it("calls onClose when the Sheet close button is activated", async () => {
    const onClose = vi.fn();
    renderInRouter(
      <DistritoPanel
        open
        onClose={onClose}
        row={CENTRO_ROW}
        kAnonymityFloor={3}
        layer="densidad"
      />,
    );
    // SheetClose button has sr-only "Close" text
    const closeBtn = screen.getByRole("button", { name: /close/i });
    closeBtn.click();
    // onClose called via Sheet onOpenChange(false)
    expect(onClose).toHaveBeenCalled();
  });

  it("does not surface PII — only count and distrito name visible", () => {
    renderInRouter(
      <DistritoPanel
        open
        onClose={vi.fn()}
        row={CENTRO_ROW}
        kAnonymityFloor={3}
        layer="densidad"
      />,
    );
    // Should not render family IDs or any personal data
    expect(screen.queryByText(/f1|family_id|uuid/i)).not.toBeInTheDocument();
  });
});
