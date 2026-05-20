/**
 * @vitest-environment jsdom
 *
 * TemplatesGrid.test.tsx — Contract tests for the 9-card templates grid.
 *
 * Tests:
 *   - All 9 cards are rendered
 *   - Cards are grouped into 3 sections (Operacional, Compliance, Financiadores)
 *   - Clicking a card calls the onOpen callback with the correct template key
 */

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { TemplatesGrid } from "../TemplatesGrid";

// ResizeObserver stub for Radix UI
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = global.ResizeObserver ?? ResizeObserverStub;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TemplatesGrid", () => {
  it("renders 9 template cards", () => {
    const onOpen = vi.fn();
    render(<TemplatesGrid onOpen={onOpen} />);
    // Each card has a button to open it
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(9);
  });

  it("renders 3 section headings", () => {
    const onOpen = vi.fn();
    render(<TemplatesGrid onOpen={onOpen} />);
    // Section headings are h3 elements — use getAllByRole to scope to headings
    const headings = screen.getAllByRole("heading", { level: 3 });
    const headingTexts = headings.map((h) => h.textContent?.toLowerCase() ?? "");
    expect(headingTexts.some((t) => t.includes("operacional"))).toBe(true);
    expect(headingTexts.some((t) => t.includes("compliance"))).toBe(true);
    expect(headingTexts.some((t) => t.includes("financiadores"))).toBe(true);
  });

  it("clicking the familiasAtendidas card calls onOpen with correct key", () => {
    const onOpen = vi.fn();
    render(<TemplatesGrid onOpen={onOpen} />);
    const btn = screen.getByRole("button", { name: /familias atendidas/i });
    fireEvent.click(btn);
    expect(onOpen).toHaveBeenCalledWith("familiasAtendidas");
  });

  it("clicking the complianceSnapshot card calls onOpen with correct key", () => {
    const onOpen = vi.fn();
    render(<TemplatesGrid onOpen={onOpen} />);
    const btn = screen.getByRole("button", { name: /compliance/i });
    fireEvent.click(btn);
    expect(onOpen).toHaveBeenCalledWith("complianceSnapshot");
  });

  it("all 9 cards are keyboard-accessible (have aria-label)", () => {
    const onOpen = vi.fn();
    render(<TemplatesGrid onOpen={onOpen} />);
    const buttons = screen
      .getAllByRole("button")
      .filter((el) => el.hasAttribute("aria-label"));
    expect(buttons.length).toBeGreaterThanOrEqual(9);
  });
});
