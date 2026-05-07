/**
 * Contract-first tests for <PendientesGrid programaId={...} />.
 *
 * Spec source: Phase 1 plan Task 13b
 *
 * Iron Law: these tests define the contract. Fix the component, never the test.
 *
 * Phase 1 note: documento_tipo is NOT NULL in the current schema, so there are
 * never any pending documents. PendientesGrid renders an empty state by design.
 * When Task 14 adds a nullable tipo_id column, the data will flow naturally.
 */

import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(cleanup);

// Import AFTER mocks are registered (none needed for this component).
import { PendientesGrid } from "../PendientesGrid";

describe("PendientesGrid", () => {
  it("1. renders the title 'Pendientes de clasificar'", () => {
    render(<PendientesGrid programaId="prog-1" />);
    expect(screen.getByText("Pendientes de clasificar")).toBeInTheDocument();
  });

  it("2. renders the empty-state text in Phase 1", () => {
    render(<PendientesGrid programaId="prog-1" />);
    expect(
      screen.getByText("No hay documentos pendientes de clasificar.")
    ).toBeInTheDocument();
  });

  it("3. accepts a programaId prop without erroring", () => {
    // Should not throw
    expect(() =>
      render(<PendientesGrid programaId="prog-1" />)
    ).not.toThrow();
  });
});
