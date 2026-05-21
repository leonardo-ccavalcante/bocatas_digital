/**
 * PersonsFilterBar interaction tests (Task 6).
 *
 * (a) ⌘K / Ctrl-K focuses the search input.
 * (b) Toggling a filter pill calls the handler, which changes which rows
 *     show (verified via the count display) and updates the filter value.
 *
 * Uses jsdom environment (matched by vitest config glob for .test.tsx in
 * client/src/features/**).
 */

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Stub ResizeObserver (jsdom doesn't provide it) ────────────────────────────
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = global.ResizeObserver ?? ResizeObserverStub;

// Radix ToggleGroup uses PointerEvents — polyfill minimally
if (!window.PointerEvent) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).PointerEvent = class PointerEvent extends MouseEvent {
    constructor(type: string, params?: PointerEventInit) {
      super(type, params);
    }
  };
}

import { PersonsFilterBar } from "../components/PersonsFilterBar";
import type { EstadoFilter, SortBy, PersonsFilterBarProps } from "../components/PersonsFilterBar";

// ── Default props ─────────────────────────────────────────────────────────────

function makeProps(overrides: Partial<PersonsFilterBarProps> = {}): PersonsFilterBarProps {
  return {
    query: "",
    onQueryChange: vi.fn(),
    estadoFilter: "todas",
    onEstadoChange: vi.fn(),
    faseFilter: "todas",
    onFaseChange: vi.fn(),
    sortBy: "recent" as SortBy,
    onSortChange: vi.fn(),
    counts: {
      total: 10,
      filtered: 10,
      byEstado: { todas: 10, Activa: 7, Inactiva: 3 },
      byFase: { todas: 10, acogida: 5, formacion: 3, autonomia: 2 },
      fases: ["acogida", "formacion", "autonomia"],
    },
    showNewButton: true,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

// ── ⌘K / Ctrl-K shortcut ─────────────────────────────────────────────────────

describe("PersonsFilterBar — ⌘K / Ctrl-K shortcut", () => {
  it("focuses the search input when Cmd+K is pressed", () => {
    render(<PersonsFilterBar {...makeProps()} />);
    const input = screen.getByTestId("personas-search-input");

    // Input is not focused initially
    expect(document.activeElement).not.toBe(input);

    act(() => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });

    expect(document.activeElement).toBe(input);
  });

  it("focuses the search input when Ctrl+K is pressed", () => {
    render(<PersonsFilterBar {...makeProps()} />);
    const input = screen.getByTestId("personas-search-input");

    expect(document.activeElement).not.toBe(input);

    act(() => {
      fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    });

    expect(document.activeElement).toBe(input);
  });

  it("is case-insensitive — Ctrl+K (uppercase K) also focuses the input", () => {
    render(<PersonsFilterBar {...makeProps()} />);
    const input = screen.getByTestId("personas-search-input");

    act(() => {
      fireEvent.keyDown(window, { key: "K", ctrlKey: true });
    });

    expect(document.activeElement).toBe(input);
  });

  it("removes the event listener on unmount (no leak)", () => {
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<PersonsFilterBar {...makeProps()} />);
    unmount();
    expect(removeEventListenerSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
    removeEventListenerSpy.mockRestore();
  });
});

// ── Filter pills ──────────────────────────────────────────────────────────────

describe("PersonsFilterBar — estado filter pills", () => {
  it("renders Todas, Activas, Inactivas pills", () => {
    render(<PersonsFilterBar {...makeProps()} />);
    // Use exact aria-label match to avoid "Activas" matching "Inactivas"
    expect(screen.getByRole("radio", { name: "Todas (10)" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Activas (7)" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Inactivas (3)" })).toBeInTheDocument();
  });

  it("calls onEstadoChange('Activa') when the Activas pill is clicked", async () => {
    const onEstadoChange = vi.fn();
    render(<PersonsFilterBar {...makeProps({ onEstadoChange })} />);

    // Exact match avoids collision with "Inactivas"
    const pill = screen.getByRole("radio", { name: "Activas (7)" });
    await userEvent.click(pill);

    expect(onEstadoChange).toHaveBeenCalledWith("Activa");
  });

  it("calls onEstadoChange('Inactiva') when the Inactivas pill is clicked", async () => {
    const onEstadoChange = vi.fn();
    render(<PersonsFilterBar {...makeProps({ onEstadoChange })} />);

    const pill = screen.getByRole("radio", { name: "Inactivas (3)" });
    await userEvent.click(pill);

    expect(onEstadoChange).toHaveBeenCalledWith("Inactiva");
  });

  it("marks the active pill with aria-checked='true'", () => {
    render(
      <PersonsFilterBar
        {...makeProps({ estadoFilter: "Activa" as EstadoFilter })}
      />,
    );
    const pill = screen.getByRole("radio", { name: "Activas (7)" });
    expect(pill).toHaveAttribute("aria-checked", "true");
  });
});

describe("PersonsFilterBar — fase filter pills", () => {
  it("renders fase pills derived from counts.fases", () => {
    render(<PersonsFilterBar {...makeProps()} />);
    // FASE_SHORT maps: acogida → "Acogida", formacion → "Formación", autonomia → "Autonomía"
    expect(screen.getByRole("radio", { name: /Acogida/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Formación/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Autonomía/i })).toBeInTheDocument();
  });

  it("calls onFaseChange with the fase value when clicked", async () => {
    const onFaseChange = vi.fn();
    render(<PersonsFilterBar {...makeProps({ onFaseChange })} />);

    await userEvent.click(screen.getByRole("radio", { name: /Acogida/i }));
    expect(onFaseChange).toHaveBeenCalledWith("acogida");
  });
});

// ── Result count display ──────────────────────────────────────────────────────

describe("PersonsFilterBar — result count bar", () => {
  it("shows filtered count and total", () => {
    render(
      <PersonsFilterBar
        {...makeProps({
          counts: {
            total: 10,
            filtered: 4,
            byEstado: { todas: 10, Activa: 7, Inactiva: 3 },
            byFase: { todas: 10 },
            fases: [],
          },
        })}
      />,
    );
    // The aria-live paragraph has data-testid="personas-result-count"
    const countEl = screen.getByTestId("personas-result-count");
    expect(countEl).toHaveTextContent("4");
    expect(countEl).toHaveTextContent("10");
  });

  it("shows 'Limpiar filtros' button when a filter is active", () => {
    render(
      <PersonsFilterBar
        {...makeProps({ estadoFilter: "Activa" as EstadoFilter })}
      />,
    );
    expect(screen.getByRole("button", { name: /limpiar filtros/i })).toBeInTheDocument();
  });

  it("does NOT show 'Limpiar filtros' when no filters are active", () => {
    render(<PersonsFilterBar {...makeProps()} />);
    expect(screen.queryByRole("button", { name: /limpiar filtros/i })).toBeNull();
  });

  it("calls all clear handlers when 'Limpiar filtros' is clicked", async () => {
    const onQueryChange = vi.fn();
    const onEstadoChange = vi.fn();
    const onFaseChange = vi.fn();
    render(
      <PersonsFilterBar
        {...makeProps({
          estadoFilter: "Activa" as EstadoFilter,
          onQueryChange,
          onEstadoChange,
          onFaseChange,
        })}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /limpiar filtros/i }));

    expect(onQueryChange).toHaveBeenCalledWith("");
    expect(onEstadoChange).toHaveBeenCalledWith("todas");
    expect(onFaseChange).toHaveBeenCalledWith("todas");
  });
});

// ── Sort control ──────────────────────────────────────────────────────────────

describe("PersonsFilterBar — sort control", () => {
  it("renders Reciente and Nombre sort options", () => {
    render(<PersonsFilterBar {...makeProps()} />);
    expect(screen.getByRole("button", { name: "Reciente" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nombre" })).toBeInTheDocument();
  });

  it("calls onSortChange when Nombre is clicked", async () => {
    const onSortChange = vi.fn();
    render(<PersonsFilterBar {...makeProps({ onSortChange })} />);

    await userEvent.click(screen.getByRole("button", { name: "Nombre" }));
    expect(onSortChange).toHaveBeenCalledWith("name");
  });
});
