/**
 * TDD tests for Bug 1 fix: MapaChoropleth must wrap the MapContainer in an
 * `isolate` div so Leaflet's internal z-index layers cannot escape the stacking
 * context and cover the Sheet side panel (z-50).
 *
 * Karpathy principle: test the observable contract (DOM structure), not
 * implementation details. The test verifies the `isolate` class is present on
 * the wrapper div when the map is rendered with valid GeoJSON features.
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { FeatureCollection } from "geojson";

// ── Mock react-leaflet ────────────────────────────────────────────────────────
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <div data-testid="leaflet-map-container" className={className}>{children}</div>
  ),
  TileLayer: () => null,
  GeoJSON: () => null,
}));

vi.mock("leaflet/dist/leaflet.css", () => ({}));

import { MapaChoropleth } from "../MapaChoropleth";
import type { DistritoStatRow } from "../../../../../server/routers/mapa";

const MOCK_GEOJSON: FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { slug: "centro", NOMBRE: "Centro" },
      geometry: {
        type: "Polygon",
        coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
      },
    },
  ],
};

const MOCK_ROWS: DistritoStatRow[] = [
  { distrito: "centro", count: 10, compliance: undefined },
];

describe("MapaChoropleth — stacking context isolation (Bug 1)", () => {
  it("wraps MapContainer in a div with class 'isolate' to contain Leaflet z-index", () => {
    const { container } = render(
      <MapaChoropleth
        rows={MOCK_ROWS}
        kAnonymityFloor={3}
        layer="densidad"
        onDistritoClick={vi.fn()}
        geoJson={MOCK_GEOJSON}
      />
    );

    // The isolate wrapper must exist somewhere in the rendered output
    const isolateDiv = container.querySelector(".isolate");
    expect(isolateDiv).not.toBeNull();
  });

  it("isolate div is the direct parent of the Leaflet MapContainer", () => {
    const { container } = render(
      <MapaChoropleth
        rows={MOCK_ROWS}
        kAnonymityFloor={3}
        layer="densidad"
        onDistritoClick={vi.fn()}
        geoJson={MOCK_GEOJSON}
      />
    );

    // Get all map containers (should be exactly one)
    const mapContainers = container.querySelectorAll("[data-testid='leaflet-map-container']");
    expect(mapContainers.length).toBe(1);
    const mapContainer = mapContainers[0];
    expect(mapContainer.parentElement?.classList.contains("isolate")).toBe(true);
  });

  it("does NOT render the isolate div when there are no GeoJSON features (empty state)", () => {
    const emptyGeoJson: FeatureCollection = { type: "FeatureCollection", features: [] };
    const { container } = render(
      <MapaChoropleth
        rows={[]}
        kAnonymityFloor={3}
        layer="densidad"
        onDistritoClick={vi.fn()}
        geoJson={emptyGeoJson}
      />
    );

    // Empty state renders MapaEmptyState, not the map — no isolate div needed
    const isolateDiv = container.querySelector(".isolate");
    expect(isolateDiv).toBeNull();
    // The empty state element should be present
    expect(container.querySelector("[data-testid='mapa-empty-state']")).toBeInTheDocument();
  });
});
