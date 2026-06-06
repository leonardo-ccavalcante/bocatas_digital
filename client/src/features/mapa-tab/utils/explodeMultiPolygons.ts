/**
 * Converts MultiPolygon features into individual Polygon features.
 * Each resulting Polygon inherits the properties of its parent MultiPolygon.
 * This ensures that styleFn can access properties like `slug` for each polygon.
 */

import type { Feature, FeatureCollection, GeoJsonProperties, Polygon } from "geojson";

export function explodeMultiPolygons(geo: FeatureCollection): FeatureCollection {
  const explodedFeatures: Feature[] = [];

  for (const feature of geo.features) {
    if (feature.geometry?.type === "MultiPolygon") {
      // Convert each polygon in the MultiPolygon to a separate Feature
      for (const polygonCoords of feature.geometry.coordinates) {
        const polygonFeature: Feature = {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: polygonCoords,
          } as Polygon,
          properties: feature.properties as GeoJsonProperties,
        };
        explodedFeatures.push(polygonFeature);
      }
    } else {
      // Keep non-MultiPolygon features as-is
      explodedFeatures.push(feature);
    }
  }

  return {
    ...geo,
    features: explodedFeatures,
  };
}
