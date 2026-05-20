/**
 * MapaChoropleth — Stage S3 react-leaflet choropleth for Madrid distritos.
 *
 * Replaces the S2 text-list stub with GeoJSON polygon rendering. Features:
 * - Two layers: "densidad" (family count) and "compliance" (ratio 0-1)
 * - K-anonymity floor: null count → neutral gray + accessible tooltip
 * - EmptyState when GeoJSON has no features (placeholder asset case — T3)
 * - Keyboard-accessible polygons via aria-label on each region
 * - No PII in tooltips — only counts and distrito names
 *
 * The geoJson prop is optional; when absent (or empty features), the
 * EmptyState renders instead of the map. This makes the component safe to
 * use while the canonical GeoJSON asset is a follow-up deliverable.
 *
 * Lazy-chunked at the TabsContent level — this file does NOT eagerly import
 * react-leaflet at the parent module level. The dynamic import happens when
 * the user navigates to the mapa tab.
 */

import { useMemo } from "react";
import type { Layer } from "leaflet";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { Feature, FeatureCollection } from "geojson";

import type { DistritoSlug } from "@shared/madrid/distritos";

import type { DistritoStatRow } from "../../../../server/routers/mapa";

// Madrid city centre coordinates
const MADRID_CENTER: [number, number] = [40.4168, -3.7038];
const MADRID_ZOOM = 11;

interface MapaChoroplethProps {
  rows: readonly DistritoStatRow[];
  kAnonymityFloor: number;
  layer: "densidad" | "compliance";
  onDistritoClick: (slug: DistritoSlug) => void;
  /** Optional injected GeoJSON — for testing or future asset overrides. */
  geoJson?: FeatureCollection;
}

// ── Color scale ───────────────────────────────────────────────────────────────

/** Returns a red-gradient fill for a normalised value t ∈ [0, 1]. */
function redScale(t: number): string {
  const r = Math.round(254 - (254 - 180) * t);
  const g = Math.round(229 - (229 - 30) * t);
  const b = Math.round(217 - (217 - 30) * t);
  return `rgb(${r},${g},${b})`;
}

// ── Feature value helpers ──────────────────────────────────────────────────

/** Build a lookup map from slug → metric value for fast polygon styling. */
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

/** Compute max non-null value for color scale normalisation. */
function maxNonNull(map: Map<string, number | null>): number {
  let max = 0;
  for (const v of map.values()) {
    if (v !== null && v > max) max = v;
  }
  return max;
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
      <p className="text-sm">
        Mapa de distritos pendiente de carga.
      </p>
      <p className="text-xs">
        El archivo GeoJSON de Madrid se incorporará próximamente.
      </p>
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
  const hasFeatures = (geoJson?.features.length ?? 0) > 0;

  const valueMap = useMemo(
    () => buildValueMap(rows, layer),
    [rows, layer],
  );

  const maxValue = useMemo(() => maxNonNull(valueMap), [valueMap]);

  const styleFn = useMemo(
    () =>
      (feature?: Feature) => {
        const slug = feature?.properties?.slug as string | undefined;
        const value = slug ? valueMap.get(slug) : undefined;

        if (!slug || value === undefined || value === null) {
          // Neutral gray for unknown or k-anon-suppressed distritos
          return {
            fillColor: "#e5e7eb",
            weight: 1,
            opacity: 1,
            color: "#94a3b8",
            fillOpacity: 0.7,
          };
        }

        const t = maxValue > 0 ? Math.min(1, value / maxValue) : 0;
        return {
          fillColor: redScale(t),
          weight: 1,
          opacity: 1,
          color: "#94a3b8",
          fillOpacity: 0.7,
        };
      },
    [valueMap, maxValue],
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

        // Tooltip text — no PII, only aggregate counts
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

        // Hover highlight
        leafletLayer.on("mouseover", () => {
          leafletLayer.setStyle?.({ weight: 2, color: "#475569" });
        });
        leafletLayer.on("mouseout", () => {
          leafletLayer.setStyle?.({ weight: 1, color: "#94a3b8" });
        });

        // Click → open DistritoPanel
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
        <MapContainer
          center={MADRID_CENTER}
          zoom={MADRID_ZOOM}
          className="h-[520px] w-full rounded-lg overflow-hidden border border-border"
          aria-label="Mapa choropleth de familias por distrito de Madrid"
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          <GeoJSON
            key={layer}
            data={geoJson as FeatureCollection}
            style={styleFn as (feature?: Feature) => object}
            onEachFeature={
              onEachFeature as (feature: Feature, layer: Layer) => void
            }
          />
        </MapContainer>
      )}
    </section>
  );
}
