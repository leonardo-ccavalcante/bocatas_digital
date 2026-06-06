/**
 * explodeMultiPolygons — TDD test suite.
 *
 * Verifies that MultiPolygon features are correctly flattened into individual
 * Polygon features, each inheriting the parent's properties (including slug).
 *
 * This ensures that the Leaflet styleFn receives the slug property for every
 * polygon, enabling proper coloring of multi-part districts like Ciudad Lineal.
 */

import { describe, it, expect } from "vitest";
import { explodeMultiPolygons } from "../utils/explodeMultiPolygons";
import type { FeatureCollection } from "geojson";

describe("explodeMultiPolygons", () => {
  it("leaves single Polygon features unchanged", () => {
    const input: FeatureCollection = {
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

    const result = explodeMultiPolygons(input);
    expect(result.features).toHaveLength(1);
    expect(result.features[0].geometry.type).toBe("Polygon");
    expect(result.features[0].properties?.slug).toBe("centro");
  });

  it("explodes MultiPolygon into individual Polygon features", () => {
    const input: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { slug: "ciudad-lineal", NOMBRE: "Ciudad Lineal" },
          geometry: {
            type: "MultiPolygon",
            coordinates: [
              [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
              [[[2, 2], [3, 2], [3, 3], [2, 3], [2, 2]]],
            ],
          },
        },
      ],
    };

    const result = explodeMultiPolygons(input);
    expect(result.features).toHaveLength(2);
    expect(result.features[0].geometry.type).toBe("Polygon");
    expect(result.features[1].geometry.type).toBe("Polygon");
    expect(result.features[0].properties?.slug).toBe("ciudad-lineal");
    expect(result.features[1].properties?.slug).toBe("ciudad-lineal");
  });

  it("preserves all properties when exploding MultiPolygons", () => {
    const input: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            slug: "chamberi",
            NOMBRE: "Chamberí",
            COD_DIS: 7,
            extra: "metadata",
          },
          geometry: {
            type: "MultiPolygon",
            coordinates: [
              [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
              [[[2, 2], [3, 2], [3, 3], [2, 3], [2, 2]]],
            ],
          },
        },
      ],
    };

    const result = explodeMultiPolygons(input);
    expect(result.features).toHaveLength(2);
    result.features.forEach((feature) => {
      expect(feature.properties?.slug).toBe("chamberi");
      expect(feature.properties?.NOMBRE).toBe("Chamberí");
      expect(feature.properties?.COD_DIS).toBe(7);
      expect(feature.properties?.extra).toBe("metadata");
    });
  });

  it("handles mixed Polygon and MultiPolygon features", () => {
    const input: FeatureCollection = {
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
        {
          type: "Feature",
          properties: { slug: "ciudad-lineal", NOMBRE: "Ciudad Lineal" },
          geometry: {
            type: "MultiPolygon",
            coordinates: [
              [[[2, 2], [3, 2], [3, 3], [2, 3], [2, 2]]],
              [[[4, 4], [5, 4], [5, 5], [4, 5], [4, 4]]],
            ],
          },
        },
      ],
    };

    const result = explodeMultiPolygons(input);
    expect(result.features).toHaveLength(3);
    expect(result.features[0].properties?.slug).toBe("centro");
    expect(result.features[1].properties?.slug).toBe("ciudad-lineal");
    expect(result.features[2].properties?.slug).toBe("ciudad-lineal");
  });

  it("returns empty FeatureCollection unchanged", () => {
    const input: FeatureCollection = {
      type: "FeatureCollection",
      features: [],
    };

    const result = explodeMultiPolygons(input);
    expect(result.features).toHaveLength(0);
  });

  it("preserves FeatureCollection metadata", () => {
    const input: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { slug: "centro" },
          geometry: {
            type: "Polygon",
            coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
          },
        },
      ],
    };

    const result = explodeMultiPolygons(input);
    expect(result.type).toBe("FeatureCollection");
  });

  it("handles MultiPolygon with 3+ parts", () => {
    const input: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { slug: "multi-part" },
          geometry: {
            type: "MultiPolygon",
            coordinates: [
              [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
              [[[2, 2], [3, 2], [3, 3], [2, 3], [2, 2]]],
              [[[4, 4], [5, 4], [5, 5], [4, 5], [4, 4]]],
            ],
          },
        },
      ],
    };

    const result = explodeMultiPolygons(input);
    expect(result.features).toHaveLength(3);
    result.features.forEach((feature) => {
      expect(feature.geometry.type).toBe("Polygon");
      expect(feature.properties?.slug).toBe("multi-part");
    });
  });
});
