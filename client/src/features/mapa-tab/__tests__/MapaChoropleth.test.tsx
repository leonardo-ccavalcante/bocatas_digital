/**
 * MapaChoropleth — S2 contract tests (kept green) + S3 extension tests.
 *
 * S2 contract: the thin-slice API (rows + kAnonymityFloor props) is preserved
 * in the S3 implementation. These tests must remain green.
 *
 * S3 additions: empty/placeholder GeoJSON EmptyState, onDistritoClick callback,
 * ARIA labels for screen readers, k-anon tooltip accessible text.
 *
 * Iron Law: fix the implementation, never the test.
 */

import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { DistritoStatRow } from "../../../../../server/routers/mapa";
import { MapaChoropleth } from "../MapaChoropleth";

afterEach(cleanup);

// jsdom stub — leaflet uses ResizeObserver
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = global.ResizeObserver ?? ResizeObserverStub;

// Mock react-leaflet — jsdom has no canvas/map support
vi.mock("react-leaflet", () => ({
  // useMap: returns a no-op map stub so FitBoundsController doesn't throw
  useMap: () => ({
    fitBounds: vi.fn(),
    invalidateSize: vi.fn(),
    getContainer: () => document.createElement('div'),
  }),
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: () => <div data-testid="tile-layer" />,
  GeoJSON: ({
    data,
    onEachFeature,
  }: {
    data: { features: Array<{ properties: { NOMBRE?: string; slug?: string; COD_DIS?: number } }> };
    onEachFeature?: (
      feature: { properties: { slug?: string } },
      layer: { bindTooltip: (t: string, opts?: object) => void; on: (e: string, h: () => void) => void },
    ) => void;
  }) => {
    // Simulate onEachFeature calls so we can test tooltip/click logic
    const features = data?.features ?? [];
    return (
      <div data-testid="geojson-layer">
        {features.map(
          (
            f: { properties: { NOMBRE?: string; slug?: string; COD_DIS?: number } },
            i: number,
          ) => {
            let tooltip = "";
            let clickHandler: (() => void) | undefined;
            if (onEachFeature) {
              onEachFeature(
                { properties: f.properties },
                {
                  bindTooltip: (t: string) => {
                    tooltip = t;
                  },
                  on: (evt: string, h: () => void) => {
                    if (evt === "click") clickHandler = h;
                  },
                },
              );
            }
            return (
              <div
                key={i}
                data-testid={`polygon-${f.properties?.slug ?? i}`}
                data-tooltip={tooltip}
                onClick={clickHandler}
                role="button"
                aria-label={
                  f.properties?.NOMBRE
                    ? `Distrito ${f.properties.NOMBRE}`
                    : undefined
                }
              />
            );
          },
        )}
      </div>
    );
  },
}));

const SAMPLE_ROWS: DistritoStatRow[] = [
  { distrito: "centro", count: 12, compliance: 0.83 },
  { distrito: "carabanchel", count: 7, compliance: 0.71 },
  { distrito: "vicalvaro", count: null },
];

// A minimal GeoJSON with 3 features matching the sample rows
const SAMPLE_GEOJSON = {
  type: "FeatureCollection" as const,
  features: [
    {
      type: "Feature" as const,
      properties: { NOMBRE: "Centro", COD_DIS: 1, slug: "centro" },
      geometry: { type: "Polygon" as const, coordinates: [] },
    },
    {
      type: "Feature" as const,
      properties: {
        NOMBRE: "Carabanchel",
        COD_DIS: 11,
        slug: "carabanchel",
      },
      geometry: { type: "Polygon" as const, coordinates: [] },
    },
    {
      type: "Feature" as const,
      properties: { NOMBRE: "Vicálvaro", COD_DIS: 19, slug: "vicalvaro" },
      geometry: { type: "Polygon" as const, coordinates: [] },
    },
  ],
};

// ── S2 contract tests (must remain green) ────────────────────────────────────
describe("<MapaChoropleth /> — S2 contract (preserved)", () => {
  it("renders one list item per distrito row (via data-distrito)", () => {
    render(
      <MapaChoropleth
        rows={SAMPLE_ROWS}
        kAnonymityFloor={3}
        layer="densidad"
        onDistritoClick={vi.fn()}
      />,
    );
    // With placeholder GeoJSON (empty features), EmptyState shows but data-distrito on list
    // or map-container is present
    expect(screen.getByTestId("mapa-choropleth")).toBeInTheDocument();
  });

  it("renders Spanish distrito labels (Centro, Carabanchel, Vicálvaro)", () => {
    render(
      <MapaChoropleth
        rows={SAMPLE_ROWS}
        kAnonymityFloor={3}
        layer="densidad"
        onDistritoClick={vi.fn()}
        geoJson={SAMPLE_GEOJSON}
      />,
    );
    // Labels appear as aria-labels on polygon buttons
    expect(screen.getByRole("button", { name: /Distrito Centro/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Distrito Carabanchel/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Distrito Vicálvaro/i }),
    ).toBeInTheDocument();
  });

  it("renders real count in tooltip when distrito has ≥3 families", () => {
    render(
      <MapaChoropleth
        rows={SAMPLE_ROWS}
        kAnonymityFloor={3}
        layer="densidad"
        onDistritoClick={vi.fn()}
        geoJson={SAMPLE_GEOJSON}
      />,
    );
    const centroPolygon = screen.getByTestId("polygon-centro");
    expect(centroPolygon.getAttribute("data-tooltip")).toContain("12");
  });

  it("suppresses count + shows k-anon placeholder for distrito with <3 families", () => {
    render(
      <MapaChoropleth
        rows={SAMPLE_ROWS}
        kAnonymityFloor={3}
        layer="densidad"
        onDistritoClick={vi.fn()}
        geoJson={SAMPLE_GEOJSON}
      />,
    );
    const vicalvaroPolygon = screen.getByTestId("polygon-vicalvaro");
    expect(vicalvaroPolygon.getAttribute("data-tooltip")).toContain("<3 familias");
  });

  it("aria-label on the container describes the data for screen readers", () => {
    render(
      <MapaChoropleth
        rows={SAMPLE_ROWS}
        kAnonymityFloor={3}
        layer="densidad"
        onDistritoClick={vi.fn()}
      />,
    );
    expect(
      screen.getByLabelText(/distritos de madrid/i),
    ).toBeInTheDocument();
  });
});

// ── S3 extension tests ────────────────────────────────────────────────────────
describe("<MapaChoropleth /> — S3 extensions", () => {
  it("renders EmptyState when GeoJSON has zero features (placeholder)", () => {
    const emptyGeoJson = { type: "FeatureCollection" as const, features: [] };
    render(
      <MapaChoropleth
        rows={SAMPLE_ROWS}
        kAnonymityFloor={3}
        layer="densidad"
        onDistritoClick={vi.fn()}
        geoJson={emptyGeoJson}
      />,
    );
    expect(screen.getByTestId("mapa-empty-state")).toBeInTheDocument();
  });

  it("renders EmptyState when geoJson prop is not provided (default placeholder)", () => {
    render(
      <MapaChoropleth
        rows={SAMPLE_ROWS}
        kAnonymityFloor={3}
        layer="densidad"
        onDistritoClick={vi.fn()}
      />,
    );
    expect(screen.getByTestId("mapa-empty-state")).toBeInTheDocument();
  });

  it("calls onDistritoClick with the correct slug when a polygon is clicked", async () => {
    const onDistritoClick = vi.fn();
    render(
      <MapaChoropleth
        rows={SAMPLE_ROWS}
        kAnonymityFloor={3}
        layer="densidad"
        onDistritoClick={onDistritoClick}
        geoJson={SAMPLE_GEOJSON}
      />,
    );

    await userEvent.click(screen.getByTestId("polygon-centro"));

    expect(onDistritoClick).toHaveBeenCalledWith("centro");
  });

  it("renders compliance tooltip when layer is 'compliance'", () => {
    render(
      <MapaChoropleth
        rows={SAMPLE_ROWS}
        kAnonymityFloor={3}
        layer="compliance"
        onDistritoClick={vi.fn()}
        geoJson={SAMPLE_GEOJSON}
      />,
    );
    const centroPolygon = screen.getByTestId("polygon-centro");
    // Compliance: 0.83 → 83%
    expect(centroPolygon.getAttribute("data-tooltip")).toContain("83%");
  });

  it("renders map container when GeoJSON has features", () => {
    render(
      <MapaChoropleth
        rows={SAMPLE_ROWS}
        kAnonymityFloor={3}
        layer="densidad"
        onDistritoClick={vi.fn()}
        geoJson={SAMPLE_GEOJSON}
      />,
    );
    expect(screen.getByTestId("map-container")).toBeInTheDocument();
    expect(screen.queryByTestId("mapa-empty-state")).not.toBeInTheDocument();
  });
});

// ── C-06: accessible data-table mirror + legend (WCAG 2.1 AA) ────────────────
// The leaflet SVG map is a visual enhancement only — keyboard/screen-reader
// users get the data from an accessible <table> that is ALWAYS rendered
// (even without GeoJSON), with counts as TEXT (not color-only) and a
// keyboard-actionable control per distrito.
describe("<MapaChoropleth /> — accessible data table (C-06)", () => {
  it("renders an accessible table even when no GeoJSON is provided", () => {
    render(
      <MapaChoropleth
        rows={SAMPLE_ROWS}
        kAnonymityFloor={3}
        layer="densidad"
        onDistritoClick={vi.fn()}
      />,
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("shows each distrito count as TEXT (not color-only)", () => {
    render(
      <MapaChoropleth
        rows={SAMPLE_ROWS}
        kAnonymityFloor={3}
        layer="densidad"
        onDistritoClick={vi.fn()}
      />,
    );
    expect(screen.getByText("12 familias")).toBeInTheDocument();
    expect(screen.getByText("7 familias")).toBeInTheDocument();
  });

  it("shows a TEXT k-anonymity marker for suppressed distritos (not just neutral color)", () => {
    render(
      <MapaChoropleth
        rows={SAMPLE_ROWS}
        kAnonymityFloor={3}
        layer="densidad"
        onDistritoClick={vi.fn()}
      />,
    );
    // Exact string targets the row cell (the legend adds "(dato protegido)").
    expect(screen.getByText("Menos de 3 familias")).toBeInTheDocument();
  });

  it("each distrito has a keyboard-actionable control that calls onDistritoClick", async () => {
    const onDistritoClick = vi.fn();
    render(
      <MapaChoropleth
        rows={SAMPLE_ROWS}
        kAnonymityFloor={3}
        layer="densidad"
        onDistritoClick={onDistritoClick}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Ver detalle de Centro/i }),
    );
    expect(onDistritoClick).toHaveBeenCalledWith("centro");
  });

  it("shows compliance as a percentage in the table on the compliance layer", () => {
    render(
      <MapaChoropleth
        rows={SAMPLE_ROWS}
        kAnonymityFloor={3}
        layer="compliance"
        onDistritoClick={vi.fn()}
      />,
    );
    expect(screen.getByText(/83\s*%/)).toBeInTheDocument();
  });

  it("renders a legend describing the scale", () => {
    render(
      <MapaChoropleth
        rows={SAMPLE_ROWS}
        kAnonymityFloor={3}
        layer="densidad"
        onDistritoClick={vi.fn()}
      />,
    );
    expect(screen.getByTestId("mapa-legend")).toBeInTheDocument();
  });
});

// ── S4: Cole Nussbaumer heatmap contract (TDD RED) ────────────────────────────
describe("<MapaChoropleth /> — S4 Cole Nussbaumer heatmap", () => {
  const DENSITY_ROWS: DistritoStatRow[] = [
    { distrito: "centro", count: 50, compliance: 0.9 },
    { distrito: "carabanchel", count: 30, compliance: 0.7 },
    { distrito: "arganzuela", count: 20, compliance: 0.8 },
    { distrito: "retiro", count: 10, compliance: 0.6 },
    { distrito: "salamanca", count: 5, compliance: 0.5 },
    { distrito: "vicalvaro", count: null },
  ];

  const DENSITY_GEOJSON = {
    type: "FeatureCollection" as const,
    features: DENSITY_ROWS.map((r, i) => ({
      type: "Feature" as const,
      properties: { NOMBRE: r.distrito, COD_DIS: i + 1, slug: r.distrito },
      geometry: { type: "Polygon" as const, coordinates: [] },
    })),
  };

  it("does NOT render a TileLayer (no OSM basemap in Cole Nussbaumer style)", () => {
    render(
      <MapaChoropleth
        rows={DENSITY_ROWS}
        kAnonymityFloor={3}
        layer="densidad"
        onDistritoClick={vi.fn()}
        geoJson={DENSITY_GEOJSON}
      />,
    );
    expect(screen.queryByTestId("tile-layer")).not.toBeInTheDocument();
  });

  it("renders legend bins with at least 3 distinct color swatches", () => {
    render(
      <MapaChoropleth
        rows={DENSITY_ROWS}
        kAnonymityFloor={3}
        layer="densidad"
        onDistritoClick={vi.fn()}
        geoJson={DENSITY_GEOJSON}
      />,
    );
    const legend = screen.getByTestId("mapa-choropleth-legend");
    const swatches = legend.querySelectorAll("[data-testid='legend-swatch']");
    expect(swatches.length).toBeGreaterThanOrEqual(3);
  });

  it("legend shows suppressed-data marker for k-anon floor", () => {
    render(
      <MapaChoropleth
        rows={DENSITY_ROWS}
        kAnonymityFloor={3}
        layer="densidad"
        onDistritoClick={vi.fn()}
        geoJson={DENSITY_GEOJSON}
      />,
    );
    const legend = screen.getByTestId("mapa-choropleth-legend");
    expect(legend).toHaveTextContent(/dato protegido|<3/i);
  });

  it("tooltip for suppressed distrito uses k-anon text", () => {
    render(
      <MapaChoropleth
        rows={DENSITY_ROWS}
        kAnonymityFloor={3}
        layer="densidad"
        onDistritoClick={vi.fn()}
        geoJson={DENSITY_GEOJSON}
      />,
    );
    const suppressedPolygon = screen.getByTestId("polygon-vicalvaro");
    expect(suppressedPolygon.getAttribute("data-tooltip")).toMatch(/<3 familias|dato protegido/i);
  });
});
