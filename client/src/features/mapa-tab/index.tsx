/**
 * Mapa Tab — Stage S3. Composes LayerToggle + MapaChoropleth + DistritoPanel.
 * Lazy-loaded via React.lazy() — react-leaflet chunk stays out of LCP bundle.
 */

import { useState, useEffect } from "react";
import type { FeatureCollection } from "geojson";
import { normalizeGeoJson } from "./utils/geojsonNormalize";

import type { DistritoSlug } from "@shared/madrid/distritos";

import { LayerToggle } from "./LayerToggle";
import { MapaChoropleth } from "./MapaChoropleth";
import { DistritoPanel } from "./DistritoPanel";
import { useMapaData } from "./hooks/useMapaData";

export default function MapaTab() {
  const [layer, setLayer] = useState<"densidad" | "compliance">("densidad");
  const [selectedDistrito, setSelectedDistrito] = useState<DistritoSlug | null>(null);

  const { rows, kAnonymityFloor, isLoading, isError, error } = useMapaData(layer);
  const [geoJson, setGeoJson] = useState<FeatureCollection | undefined>(undefined);

  useEffect(() => {
    fetch("/manus-storage/madrid-distritos_c2dcb693.geojson")
      .then((r) => r.json())
      .then((raw: FeatureCollection) => setGeoJson(normalizeGeoJson(raw)))
      .catch((err) => console.warn("[MapaTab] GeoJSON load failed:", err));
  }, []);

  const selectedRow = rows.find((r) => r.distrito === selectedDistrito) ?? null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12" role="status" aria-label="Cargando datos del mapa">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (isError || !rows) {
    return (
      <div className="rounded-lg border border-destructive bg-card px-4 py-6 text-destructive" role="alert">
        No se pudo cargar el mapa.{" "}
        {(error as Error | null)?.message ?? "Inténtalo de nuevo."}
      </div>
    );
  }

  return (
    <section aria-labelledby="mapa-tab-heading" className="space-y-4 p-1">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="mapa-tab-heading" className="text-h2 font-sans">
            Familias por distrito
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {layer === "densidad"
              ? "Número de familias activas por distrito de Madrid"
              : "Porcentaje de documentación completa por distrito"}
          </p>
        </div>
        <LayerToggle layer={layer} onChange={setLayer} />
      </div>

      <MapaChoropleth
        rows={rows}
        kAnonymityFloor={kAnonymityFloor}
        layer={layer}
        onDistritoClick={(slug) => setSelectedDistrito(slug)}
        geoJson={geoJson}
      />

      {selectedRow && (
        <DistritoPanel
          open={selectedDistrito !== null}
          onClose={() => setSelectedDistrito(null)}
          row={selectedRow}
          kAnonymityFloor={kAnonymityFloor}
          layer={layer}
        />
      )}
    </section>
  );
}
