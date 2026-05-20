/**
 * LayerToggle — test suite (TDD).
 *
 * Radix ToggleGroup (type="single") renders items as role="radio" with
 * aria-checked. Tests use those semantics rather than role="button"/aria-pressed.
 *
 * Iron Law: fix the implementation, never the test.
 */

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

afterEach(cleanup);

// jsdom stubs for Radix primitives
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

import { LayerToggle } from "../LayerToggle";

describe("<LayerToggle />", () => {
  it("renders Densidad and Compliance radio options", () => {
    render(<LayerToggle layer="densidad" onChange={vi.fn()} />);
    expect(screen.getByRole("radio", { name: /densidad/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /compliance/i })).toBeInTheDocument();
  });

  it("marks the active layer radio as checked (aria-checked=true)", () => {
    render(<LayerToggle layer="densidad" onChange={vi.fn()} />);
    const densidadRadio = screen.getByRole("radio", { name: /densidad/i });
    expect(densidadRadio).toHaveAttribute("aria-checked", "true");
  });

  it("marks the inactive layer radio as not checked", () => {
    render(<LayerToggle layer="densidad" onChange={vi.fn()} />);
    const complianceRadio = screen.getByRole("radio", { name: /compliance/i });
    expect(complianceRadio).toHaveAttribute("aria-checked", "false");
  });

  it("calls onChange with 'compliance' when Compliance is clicked", async () => {
    const onChange = vi.fn();
    render(<LayerToggle layer="densidad" onChange={onChange} />);

    await userEvent.click(screen.getByRole("radio", { name: /compliance/i }));

    expect(onChange).toHaveBeenCalledWith("compliance");
  });

  it("calls onChange with 'densidad' when Densidad is clicked while compliance is active", async () => {
    const onChange = vi.fn();
    render(<LayerToggle layer="compliance" onChange={onChange} />);

    await userEvent.click(screen.getByRole("radio", { name: /densidad/i }));

    expect(onChange).toHaveBeenCalledWith("densidad");
  });

  it("does not call onChange when the already-active layer is clicked", async () => {
    // Clicking the already-checked radio in ToggleGroup fires onValueChange("")
    // which our handler ignores — onChange must not be called
    const freshOnChange = vi.fn();
    const { rerender } = render(
      <LayerToggle layer="densidad" onChange={freshOnChange} />,
    );
    rerender(<LayerToggle layer="densidad" onChange={freshOnChange} />);
    await userEvent.click(screen.getAllByRole("radio", { name: /densidad/i })[0]);

    expect(freshOnChange).not.toHaveBeenCalled();
  });

  it("has an accessible label on the toggle group", () => {
    render(<LayerToggle layer="densidad" onChange={vi.fn()} />);
    expect(
      screen.getByRole("group", { name: /capa del mapa/i }),
    ).toBeInTheDocument();
  });
});
