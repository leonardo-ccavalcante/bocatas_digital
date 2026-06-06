/**
 * DistritoPanel — shadcn Sheet side panel shown when a district polygon is clicked.
 *
 * Displays: district name, family count (or k-anon suppression message), compliance
 * ratio (compliance layer only), a mini-map zoomed to the selected district, and a
 * "Ver familias" CTA that deep-links to the familias tab with the district filter.
 *
 * No PII is surfaced — only counts and distrito names.
 */

import { useMemo } from "react";
import { Link } from "wouter";
import type { FeatureCollection } from "geojson";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { DISTRITO_LABELS } from "@shared/madrid/distritos";

import type { DistritoStatRow } from "../../../../server/routers/mapa";

interface DistritoPanelProps {
  open: boolean;
  onClose: () => void;
  row: DistritoStatRow;
  kAnonymityFloor: number;
  layer: "densidad" | "compliance";
  /** Optional GeoJSON — when provided, renders a mini-map zoomed to the selected district. */
  geoJson?: FeatureCollection;
}

// Highlight style for the selected district polygon
const SELECTED_STYLE = {
  fillColor: "#3182bd",
  fillOpacity: 0.5,
  weight: 2,
  color: "#1a4f7a",
  opacity: 1,
};

export function DistritoPanel({
  open,
  onClose,
  row,
  kAnonymityFloor,
  layer,
  geoJson,
}: DistritoPanelProps) {
  const label = DISTRITO_LABELS[row.distrito];
  const isSuppressed = row.count === null;

  // Filter GeoJSON to only the selected district's feature
  const districtGeoJson = useMemo<FeatureCollection | undefined>(() => {
    if (!geoJson) return undefined;
    const features = geoJson.features.filter(
      (f) => f.properties?.slug === row.distrito,
    );
    if (features.length === 0) return undefined;
    return { type: "FeatureCollection", features };
  }, [geoJson, row.distrito]);

  function buildStat(): string {
    if (isSuppressed) {
      return `<${kAnonymityFloor} familias`;
    }
    if (layer === "compliance" && row.compliance != null) {
      const pct = Math.round(row.compliance * 100);
      return `${pct}% compliance · ${row.count} familias`;
    }
    return `${row.count} familias`;
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <SheetContent side="right" aria-label={`Detalle de ${label}`}>
        <SheetHeader>
          <SheetTitle className="font-display">{label}</SheetTitle>
          <SheetDescription>
            {buildStat()}
          </SheetDescription>
        </SheetHeader>

        {/* Mini-map zoomed to the selected district */}
        {districtGeoJson && (
          <div className="my-4 h-48 w-full overflow-hidden rounded-md border border-border">
            <MapContainer
              bounds={undefined}
              zoom={12}
              center={[40.4168, -3.7038]}
              className="h-full w-full"
              zoomControl={false}
              attributionControl={false}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />
              <GeoJSON
                key={row.distrito}
                data={districtGeoJson}
                style={() => SELECTED_STYLE}
              />
            </MapContainer>
          </div>
        )}

        {!isSuppressed && (
          <SheetFooter>
            <Link
              href={`?tab=familias&distrito=${row.distrito}`}
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Ver familias &rarr;
            </Link>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
