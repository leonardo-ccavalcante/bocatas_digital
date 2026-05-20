/**
 * Maps GeoJSON NOMBRE properties (e.g. "Chamberí") to DistritoSlug values
 * (e.g. "chamberi") for Madrid's 21 administrative distritos.
 */

import type { Feature, FeatureCollection, GeoJsonProperties } from "geojson";
import { isDistritoSlug } from "@shared/madrid/distritos";
import type { DistritoSlug } from "@shared/madrid/distritos";

/**
 * Converts a NOMBRE string to a DistritoSlug by stripping accents, lowercasing,
 * and replacing spaces with hyphens. Returns null for unrecognised values.
 */
export function normalizeNombreToSlug(nombre: string): DistritoSlug | null {
  if (!nombre) return null;
  const slug = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  return isDistritoSlug(slug) ? slug : null;
}

/**
 * Returns a new FeatureCollection with a `slug` property injected into each
 * feature that has a recognisable NOMBRE. Non-matching features are unchanged.
 */
export function normalizeGeoJson(geo: FeatureCollection): FeatureCollection {
  return {
    ...geo,
    features: geo.features.map(
      (feature: Feature): Feature => {
        const nombre = feature.properties?.NOMBRE as string | undefined;
        if (!nombre) return feature;
        const slug = normalizeNombreToSlug(nombre);
        if (!slug) return feature;
        return {
          ...feature,
          properties: { ...(feature.properties as GeoJsonProperties), slug } as GeoJsonProperties,
        };
      },
    ),
  };
}
