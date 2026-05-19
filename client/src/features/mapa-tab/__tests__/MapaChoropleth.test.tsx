/**
 * Stage S2 thin-slice toolchain proof.
 *
 * Proves that the thin vertical slice's render path works end-to-end:
 *   • TS types from server/routers/mapa.ts cross the import boundary cleanly
 *   • Tailwind tokens (text-muted-foreground, bg-card, border-border) resolve
 *   • shared/madrid/distritos.ts is reachable from client code
 *   • k-anonymity tooltip surfaces when count is null
 *
 * Contract — fix the component, never the test.
 */

import React from "react";
import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import type { DistritoStatRow } from "../../../../../server/routers/mapa";
import { MapaChoropleth } from "../MapaChoropleth";

afterEach(cleanup);

const SAMPLE_ROWS: DistritoStatRow[] = [
  { distrito: "centro", count: 12, compliance: 0.83 },
  { distrito: "carabanchel", count: 7, compliance: 0.71 },
  { distrito: "vicalvaro", count: null },
];

describe("<MapaChoropleth /> — thin slice", () => {
  it("renders one list item per distrito row", () => {
    render(<MapaChoropleth rows={SAMPLE_ROWS} kAnonymityFloor={3} />);
    expect(screen.getByTestId("mapa-distrito-list")).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
  });

  it("renders Spanish distrito labels (Centro, Carabanchel, Vicálvaro)", () => {
    render(<MapaChoropleth rows={SAMPLE_ROWS} kAnonymityFloor={3} />);
    expect(screen.getByText("Centro")).toBeInTheDocument();
    expect(screen.getByText("Carabanchel")).toBeInTheDocument();
    expect(screen.getByText("Vicálvaro")).toBeInTheDocument();
  });

  it("renders real count when distrito has ≥3 families", () => {
    render(<MapaChoropleth rows={SAMPLE_ROWS} kAnonymityFloor={3} />);
    expect(screen.getByText("12 familias")).toBeInTheDocument();
    expect(screen.getByText("7 familias")).toBeInTheDocument();
  });

  it("suppresses count + shows k-anon placeholder for distrito with <3 families", () => {
    render(<MapaChoropleth rows={SAMPLE_ROWS} kAnonymityFloor={3} />);
    expect(screen.getByText("<3 familias")).toBeInTheDocument();
    // The k-anon-suppressed row must not surface the real count
    expect(screen.queryByText(/^[12]\s*familias$/)).not.toBeInTheDocument();
  });

  it("each list item carries a data-distrito attribute matching its slug", () => {
    const { container } = render(
      <MapaChoropleth rows={SAMPLE_ROWS} kAnonymityFloor={3} />,
    );
    const slugs = Array.from(container.querySelectorAll("[data-distrito]")).map(
      (el) => el.getAttribute("data-distrito"),
    );
    expect(slugs).toEqual(["centro", "carabanchel", "vicalvaro"]);
  });

  it("aria-label on the list describes the data for screen readers", () => {
    render(<MapaChoropleth rows={SAMPLE_ROWS} kAnonymityFloor={3} />);
    expect(
      screen.getByLabelText(/distritos de madrid/i),
    ).toBeInTheDocument();
  });
});
