/**
 * Tests for <FamiliasFilterBar /> — the collapsible filter section.
 *
 * The accessibility contract (search aria-label, estado Select aria-label,
 * Sin GUF / Sin informe aria-pressed) is also asserted at the FamiliasList
 * level; here we focus on the NEW interactive logic: collapse/expand and the
 * active-filter pills shown when collapsed.
 */

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FamiliasFilterBar } from "../FamiliasFilterBar";
import type { FamiliasFilters } from "../hooks/useFamiliasFilters";

// Radix Select needs these in jsdom.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = global.ResizeObserver ?? ResizeObserverStub;
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

afterEach(cleanup);

const baseFilters: FamiliasFilters = {
  estado: "activa",
  sinGuf: false,
  sinInformeSocial: false,
};

function setup(overrides: Partial<React.ComponentProps<typeof FamiliasFilterBar>> = {}) {
  const props: React.ComponentProps<typeof FamiliasFilterBar> = {
    filters: baseFilters,
    searchInput: "",
    onSearchInputChange: vi.fn(),
    onCommitSearch: vi.fn(),
    onEstadoChange: vi.fn(),
    onToggleSinGuf: vi.fn(),
    onToggleSinInforme: vi.fn(),
    onClear: vi.fn(),
    shownCount: 5,
    ...overrides,
  };
  render(<FamiliasFilterBar {...props} />);
  return props;
}

describe("<FamiliasFilterBar />", () => {
  it("starts expanded: search input is visible", () => {
    setup();
    expect(screen.getByRole("textbox", { name: /buscar familia/i })).toBeVisible();
  });

  it("collapses when the header is clicked, hiding the controls", async () => {
    const user = userEvent.setup();
    setup();
    const toggle = screen.getByRole("button", { name: /filtros/i });
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("textbox", { name: /buscar familia/i })).toBeNull();
  });

  it("shows active-filter pills only when collapsed", async () => {
    const user = userEvent.setup();
    setup({
      filters: { ...baseFilters, sinGuf: true },
      searchInput: "García",
    });
    // Expanded: no pills.
    expect(screen.queryByText("sin GUF")).toBeNull();

    await user.click(screen.getByRole("button", { name: /filtros/i }));

    // Collapsed: pills summarise state.
    expect(screen.getByText("sin GUF")).toBeInTheDocument();
    expect(screen.getByText('"García"')).toBeInTheDocument();
  });

  it("exposes aria-pressed on the Sin GUF / Sin informe toggles", () => {
    setup({ filters: { ...baseFilters, sinGuf: true } });
    expect(screen.getByRole("button", { name: /sin guf/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByRole("button", { name: /sin informe social/i }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("fires onToggleSinGuf when Sin GUF is clicked", async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(screen.getByRole("button", { name: /sin guf/i }));
    expect(props.onToggleSinGuf).toHaveBeenCalledTimes(1);
  });

  it("shows the Limpiar action only when filters are dirty", () => {
    const { rerender } = render(
      <FamiliasFilterBar
        filters={baseFilters}
        searchInput=""
        onSearchInputChange={vi.fn()}
        onCommitSearch={vi.fn()}
        onEstadoChange={vi.fn()}
        onToggleSinGuf={vi.fn()}
        onToggleSinInforme={vi.fn()}
        onClear={vi.fn()}
        shownCount={5}
      />,
    );
    expect(screen.queryByRole("button", { name: /limpiar/i })).toBeNull();

    rerender(
      <FamiliasFilterBar
        filters={{ ...baseFilters, sinInformeSocial: true }}
        searchInput=""
        onSearchInputChange={vi.fn()}
        onCommitSearch={vi.fn()}
        onEstadoChange={vi.fn()}
        onToggleSinGuf={vi.fn()}
        onToggleSinInforme={vi.fn()}
        onClear={vi.fn()}
        shownCount={5}
      />,
    );
    expect(screen.getByRole("button", { name: /limpiar/i })).toBeInTheDocument();
  });
});
