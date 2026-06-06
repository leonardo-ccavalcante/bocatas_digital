/**
 * MapaChoropleth — Stage S4 Cole Nussbaumer choropleth for Madrid distritos.
 *
 * Design principles (Cole Nussbaumer Knaflic, "Storytelling with Data"):
 * - Sequential single-hue palette (blue: light → dark) for density data.
 *   Diverging palettes are reserved for data with a meaningful midpoint.
 * - No decorative basemap (OSM tiles removed) — the polygons ARE the story.
 *   A minimal light-gray background lets the choropleth breathe.
 * - Quantile classification (5 bins) ensures equal-count bins, preventing
 *   outliers from washing out the rest of the distribution.
 * - Explicit legend with labeled bins and a separate k-anon suppression marker.
 * - Compliance layer keeps the red-scale (diverging from 0→1 is appropriate
 *   since 0% and 100% are both meaningful extremes).
 *
 * Accessibility (WCAG 2.1 AA, TECH_DEBT C-06): the leaflet SVG map encodes
 * values by fill COLOR only and its polygons are NOT keyboard/screen-reader
 * reachable. The map is therefore a visual enhancement; the accessible source
 * of truth is the always-rendered <DistritoDataTable> below it.
 *
 * The geoJson prop is optional; when absent (or empty features), the
 * EmptyState renders instead of the map.
 */

import { useMemo } from "react";
import type { Layer } from "leaflet";
import { MapContainer, GeoJSON, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { Feature, FeatureCollection } from "geojson";

import type { DistritoSlug } from "@shared/madrid/distritos";
import { explodeMultiPolygons } from "./utils/explodeMultiPolygons";
import type { DistritoStatRow } from "../../../../server/routers/mapa";
import { DistritoDataTable } from "./DistritoDataTable";

// Madrid city centre coordinates
const MADRID_CENTER: [number, number] = [40.4168, -3.7038];
const MADRID_ZOOM = 11;

// ── Cole Nussbaumer blue sequential palette (5 bins) ─────────────────────────
// Based on ColorBrewer Blues-5: light → dark, perceptually uniform.
const BLUE_BINS = ["#c6dbef", "#9ecae1", "#6baed6", "#3182bd", "#08519c"] as const;

// Neutral gray for k-anon suppressed distritos
const SUPPRESSED_COLOR = "#d1d5db";

interface MapaChoroplethProps {
  rows: readonly DistritoStatRow[];
  kAnonymityFloor: number;
  layer: "densidad" | "compliance";
  onDistritoClick: (slug: DistritoSlug) => void;
  /** Optional injected GeoJSON — for testing or future asset overrides. */
  geoJson?: FeatureCollection;
}

// ── Quantile classifier ───────────────────────────────────────────────────────

/**
 * Compute quantile bin boundaries for n bins from a sorted array of values.
 * Returns an array of (n-1) thresholds: value < thresholds[0] → bin 0, etc.
 */
function quantileThresholds(sorted: number[], nBins: number): number[] {
  if (sorted.length === 0 || nBins <= 1) return [];
  const thresholds: number[] = [];
  for (let i = 1; i < nBins; i++) {
    const idx = (i / nBins) * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    const frac = idx - lo;
    thresholds.push(sorted[lo] + (sorted[hi] - sorted[lo]) * frac);
  }
  return thresholds;
}

/** Assign a bin index [0, nBins-1] for a value given thresholds. */
function binIndex(value: number, thresholds: number[]): number {
  for (let i = 0; i < thresholds.length; i++) {
    if (value <= thresholds[i]) return i;
  }
  return thresholds.length; // last bin
}

// ── Color scale helpers ───────────────────────────────────────────────────────

/** Returns a red-gradient fill for a normalised value t ∈ [0, 1] (compliance layer). */
function redScale(t: number): string {
  const r = Math.round(254 - (254 - 180) * t);
  const g = Math.round(229 - (229 - 30) * t);
  const b = Math.round(217 - (217 - 30) * t);
  return `rgb(${r},${g},${b})`;
}

// ── Feature value helpers ─────────────────────────────────────────────────────

function buildValueMap(
  rows: readonly DistritoStatRow[],
  layer: "densidad" | "compliance",
): Map<string, number | null> {
  const map = new Map<string, number | null>();
  for (const row of rows) {
    const value =
      row.count === null
        ? null
        : layer === "compliance"
        ? (row.compliance ?? null)
        : row.count;
    map.set(row.distrito, value);
  }
  return map;
}

// ── Legend component ──────────────────────────────────────────────────────────

interface LegendBin {
  color: string;
  label: string;
}

function MapaLegend({
  bins,
  kAnonymityFloor,
}: {
  bins: LegendBin[];
  kAnonymityFloor: number;
}) {
  return (
    <div
      data-testid="mapa-choropleth-legend"
      className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
    >
      <span className="font-medium text-foreground">Leyenda:</span>
      {bins.map((bin, i) => (
        <span key={i} className="flex items-center gap-1">
          <span
            data-testid="legend-swatch"
            className="inline-block h-3 w-5 rounded-sm border border-border"
            style={{ backgroundColor: bin.color }}
            aria-hidden="true"
          />
          {bin.label}
        </span>
      ))}
      {/* K-anonymity suppression marker */}
      <span className="flex items-center gap-1">
        <span
          data-testid="legend-swatch"
          className="inline-block h-3 w-5 rounded-full border border-border"
          style={{ backgroundColor: SUPPRESSED_COLOR }}
          aria-hidden="true"
        />
        {`Menos de ${kAnonymityFloor} familias (dato protegido)`}
      </span>
    </div>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────

function MapaEmptyState() {
  return (
    <div
      data-testid="mapa-empty-state"
      className="flex h-64 flex-col items-center justify-center gap-2 rounded-lg border border-border bg-card text-muted-foreground"
      role="status"
      aria-label="Mapa no disponible"
    >
      <span className="text-4xl" aria-hidden="true">
        🗺️
      </span>
      <p className="text-sm">Mapa de distritos pendiente de carga.</p>
      <p className="text-xs">El archivo GeoJSON de Madrid se incorporará próximamente.</p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MapaChoropleth({
  rows,
  kAnonymityFloor,
  layer,
  onDistritoClick,
  geoJson,
}: MapaChoroplethProps) {
  // Explode MultiPolygons so each polygon is a separate feature
  // This ensures styleFn can access the slug property for each polygon
  const explodedGeoJson = useMemo(() => {
    if (!geoJson) return undefined;
    return explodeMultiPolygons(geoJson);
  }, [geoJson]);

  const hasFeatures = (explodedGeoJson?.features.length ?? 0) > 0;

  const valueMap = useMemo(() => buildValueMap(rows, layer), [rows, layer]);

  // Build quantile thresholds from non-null density values
  const { thresholds, maxValue } = useMemo(() => {
    const nonNull = [...valueMap.values()]
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b);
    const thresholds =
      layer === "densidad" ? quantileThresholds(nonNull, BLUE_BINS.length) : [];
    const maxValue = nonNull.length > 0 ? nonNull[nonNull.length - 1] : 1;
    return { thresholds, maxValue };
  }, [valueMap, layer]);

  // Legend bins
  const legendBins = useMemo<LegendBin[]>(() => {
    if (layer === "compliance") {
      return [
        { color: redScale(0), label: "0% compliance" },
        { color: redScale(0.5), label: "50%" },
        { color: redScale(1), label: "100%" },
      ];
    }
    // Density: label each bin with its threshold range
    const allThresholds = [0, ...thresholds, maxValue];
    return BLUE_BINS.map((color, i) => ({
      color,
      label:
        i === BLUE_BINS.length - 1
          ? `>${Math.round(allThresholds[i])} fam.`
          : `${Math.round(allThresholds[i])}–${Math.round(allThresholds[i + 1])} fam.`,
    }));
  }, [layer, thresholds, maxValue]);

  const styleFn = useMemo(
    () =>
      (feature?: Feature) => {
        const slug = feature?.properties?.slug as string | undefined;
        const value = slug ? valueMap.get(slug) : undefined;

        if (!slug || value === undefined || value === null) {
          return {
            fillColor: SUPPRESSED_COLOR,
            weight: 1,
            opacity: 1,
            color: "#9ca3af",
            fillOpacity: 0.75,
          };
        }

        let fillColor: string;
        if (layer === "compliance") {
          const t = maxValue > 0 ? Math.min(1, (value as number) / maxValue) : 0;
          fillColor = redScale(t);
        } else {
          const bin = binIndex(value as number, thresholds);
          fillColor = BLUE_BINS[Math.min(bin, BLUE_BINS.length - 1)];
        }

        return {
          fillColor,
          weight: 1,
          opacity: 1,
          color: "#6b7280",
          fillOpacity: 0.8,
        };
      },
    [valueMap, layer, thresholds, maxValue],
  );

  const onEachFeature = useMemo(
    () =>
      (
        feature: Feature,
        leafletLayer: Layer & {
          bindTooltip: (content: string, opts?: object) => void;
          on: (event: string, handler: () => void) => void;
          setStyle?: (style: object) => void;
        },
      ) => {
        const slug = feature.properties?.slug as string | undefined;
        const nombre = feature.properties?.NOMBRE as string | undefined;

        if (!slug) return;

        const value = valueMap.get(slug);
        const isSuppressed = value === null || value === undefined;

        let tooltipText: string;
        if (isSuppressed) {
          tooltipText = `${nombre ?? slug}: <${kAnonymityFloor} familias`;
        } else if (layer === "compliance") {
          const pct = Math.round((value as number) * 100);
          tooltipText = `${nombre ?? slug}: ${pct}% compliance`;
        } else {
          tooltipText = `${nombre ?? slug}: ${value} familias`;
        }

        leafletLayer.bindTooltip(tooltipText, { sticky: true });

        leafletLayer.on("mouseover", () => {
          leafletLayer.setStyle?.({ weight: 2, color: "#374151" });
        });
        leafletLayer.on("mouseout", () => {
          leafletLayer.setStyle?.({ weight: 1, color: "#6b7280" });
        });

        leafletLayer.on("click", () => {
          onDistritoClick(slug as DistritoSlug);
        });
      },
    [valueMap, layer, kAnonymityFloor, onDistritoClick],
  );

  return (
    <section
      data-testid="mapa-choropleth"
      aria-label="Distritos de Madrid con número de familias atendidas"
      className="space-y-2"
    >
      {!hasFeatures ? (
        <MapaEmptyState />
      ) : (
        // Cole Nussbaumer: no OSM basemap — the choropleth IS the data.
        // A plain white/light-gray background keeps focus on the polygons.
        <MapContainer
          center={MADRID_CENTER}
          zoom={MADRID_ZOOM}
          className="h-[300px] md:h-[520px] w-full rounded-lg overflow-hidden border border-border outline-none"
        >
          {/* OpenStreetMap tiles provide geographic context */}
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            maxZoom={19}
          />
          {/*
           * GeoJSON choropleth layer with density coloring.
           * Key includes rows.length so the layer re-mounts when data arrives,
           * forcing Leaflet to re-apply styles when rows load.
           */}
          <GeoJSON
            key={`${layer}-${rows.length}`}
            data={explodedGeoJson as FeatureCollection}
            style={styleFn as (feature?: Feature) => object}
            onEachFeature={onEachFeature as (feature: Feature, layer: Layer) => void}
          />
        </MapContainer>
      )}

      {/* Legend — always rendered when map is visible */}
      {hasFeatures && (
        <MapaLegend bins={legendBins} kAnonymityFloor={kAnonymityFloor} />
      )}

      {/* Accessible source of truth — always rendered (C-06). */}
      <DistritoDataTable
        rows={rows}
        kAnonymityFloor={kAnonymityFloor}
        layer={layer}
        onDistritoClick={onDistritoClick}
      />
    </section>
  );
}
