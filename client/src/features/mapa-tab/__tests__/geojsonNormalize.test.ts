/**
 * geojsonNormalize — RED test suite (TDD phase 1).
 *
 * Verifies that the NOMBRE property from Madrid GeoJSON features is correctly
 * mapped to the canonical DistritoSlug values used throughout the app.
 *
 * Iron Law: fix the implementation, never the test.
 */

import { describe, it, expect } from "vitest";
import { normalizeNombreToSlug, normalizeGeoJson } from "../utils/geojsonNormalize";
import type { FeatureCollection } from "geojson";

describe("normalizeNombreToSlug", () => {
  it("maps 'Centro' → 'centro'", () => {
    expect(normalizeNombreToSlug("Centro")).toBe("centro");
  });

  it("maps 'Arganzuela' → 'arganzuela'", () => {
    expect(normalizeNombreToSlug("Arganzuela")).toBe("arganzuela");
  });

  it("maps 'Retiro' → 'retiro'", () => {
    expect(normalizeNombreToSlug("Retiro")).toBe("retiro");
  });

  it("maps 'Salamanca' → 'salamanca'", () => {
    expect(normalizeNombreToSlug("Salamanca")).toBe("salamanca");
  });

  it("maps 'Chamartín' (with tilde) → 'chamartin'", () => {
    expect(normalizeNombreToSlug("Chamartín")).toBe("chamartin");
  });

  it("maps 'Tetuán' (with tilde) → 'tetuan'", () => {
    expect(normalizeNombreToSlug("Tetuán")).toBe("tetuan");
  });

  it("maps 'Chamberí' (with tilde) → 'chamberi'", () => {
    expect(normalizeNombreToSlug("Chamberí")).toBe("chamberi");
  });

  it("maps 'Fuencarral-El Pardo' → 'fuencarral-el-pardo'", () => {
    expect(normalizeNombreToSlug("Fuencarral-El Pardo")).toBe(
      "fuencarral-el-pardo",
    );
  });

  it("maps 'Moncloa-Aravaca' → 'moncloa-aravaca'", () => {
    expect(normalizeNombreToSlug("Moncloa-Aravaca")).toBe("moncloa-aravaca");
  });

  it("maps 'Latina' → 'latina'", () => {
    expect(normalizeNombreToSlug("Latina")).toBe("latina");
  });

  it("maps 'Carabanchel' → 'carabanchel'", () => {
    expect(normalizeNombreToSlug("Carabanchel")).toBe("carabanchel");
  });

  it("maps 'Usera' → 'usera'", () => {
    expect(normalizeNombreToSlug("Usera")).toBe("usera");
  });

  it("maps 'Puente de Vallecas' → 'puente-de-vallecas'", () => {
    expect(normalizeNombreToSlug("Puente de Vallecas")).toBe(
      "puente-de-vallecas",
    );
  });

  it("maps 'Moratalaz' → 'moratalaz'", () => {
    expect(normalizeNombreToSlug("Moratalaz")).toBe("moratalaz");
  });

  it("maps 'Ciudad Lineal' → 'ciudad-lineal'", () => {
    expect(normalizeNombreToSlug("Ciudad Lineal")).toBe("ciudad-lineal");
  });

  it("maps 'Hortaleza' → 'hortaleza'", () => {
    expect(normalizeNombreToSlug("Hortaleza")).toBe("hortaleza");
  });

  it("maps 'Villaverde' → 'villaverde'", () => {
    expect(normalizeNombreToSlug("Villaverde")).toBe("villaverde");
  });

  it("maps 'Villa de Vallecas' → 'villa-de-vallecas'", () => {
    expect(normalizeNombreToSlug("Villa de Vallecas")).toBe("villa-de-vallecas");
  });

  it("maps 'Vicálvaro' (with tilde) → 'vicalvaro'", () => {
    expect(normalizeNombreToSlug("Vicálvaro")).toBe("vicalvaro");
  });

  it("maps 'San Blas-Canillejas' → 'san-blas-canillejas'", () => {
    expect(normalizeNombreToSlug("San Blas-Canillejas")).toBe(
      "san-blas-canillejas",
    );
  });

  it("maps 'Barajas' → 'barajas'", () => {
    expect(normalizeNombreToSlug("Barajas")).toBe("barajas");
  });

  it("returns null for unknown NOMBRE values", () => {
    expect(normalizeNombreToSlug("Unknown District")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(normalizeNombreToSlug("")).toBeNull();
  });
});

describe("normalizeGeoJson", () => {
  it("injects 'slug' property into each feature that matches a known distrito", () => {
    const input: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { NOMBRE: "Centro", COD_DIS: 1 },
          geometry: { type: "Polygon", coordinates: [] },
        },
        {
          type: "Feature",
          properties: { NOMBRE: "Tetuán", COD_DIS: 6 },
          geometry: { type: "Polygon", coordinates: [] },
        },
      ],
    };

    const result = normalizeGeoJson(input);
    expect(result.features[0].properties?.slug).toBe("centro");
    expect(result.features[1].properties?.slug).toBe("tetuan");
  });

  it("preserves existing properties alongside the injected slug", () => {
    const input: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { NOMBRE: "Retiro", COD_DIS: 3 },
          geometry: { type: "Polygon", coordinates: [] },
        },
      ],
    };

    const result = normalizeGeoJson(input);
    expect(result.features[0].properties?.NOMBRE).toBe("Retiro");
    expect(result.features[0].properties?.COD_DIS).toBe(3);
    expect(result.features[0].properties?.slug).toBe("retiro");
  });

  it("leaves slug undefined for features with unrecognised NOMBRE", () => {
    const input: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { NOMBRE: "Unknown" },
          geometry: { type: "Polygon", coordinates: [] },
        },
      ],
    };

    const result = normalizeGeoJson(input);
    expect(result.features[0].properties?.slug).toBeUndefined();
  });

  it("returns an empty FeatureCollection unchanged", () => {
    const empty: FeatureCollection = { type: "FeatureCollection", features: [] };
    const result = normalizeGeoJson(empty);
    expect(result.features).toHaveLength(0);
  });
});
