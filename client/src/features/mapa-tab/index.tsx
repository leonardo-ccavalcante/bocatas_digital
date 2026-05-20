/**
 * Mapa Tab — Stage S2 thin-slice entry point.
 *
 * Composes MapaChoropleth + a loading state + an error state. The full S3
 * implementation adds LayerToggle + DistritoPanel; the thin slice keeps
 * those out so the toolchain proof stays small.
 *
 * Loaded lazily from ProgramTabs via React.lazy() so the react-leaflet
 * chunk (~150KB, lands S3) stays out of the LCP-critical bundle.
 */

import { trpc } from "@/lib/trpc";

import { MapaChoropleth } from "./MapaChoropleth";

export default function MapaTab() {
  const { data, isLoading, isError, error } = trpc.mapa.distritoStats.useQuery({
    layer: "densidad",
  });

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center py-12"
        role="status"
        aria-label="Cargando datos del mapa"
      >
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div
        className="rounded-lg border border-destructive bg-card px-4 py-6 text-destructive"
        role="alert"
      >
        No se pudo cargar el mapa. {error?.message ?? "Inténtalo de nuevo."}
      </div>
    );
  }

  return (
    <section aria-labelledby="mapa-tab-heading" className="space-y-4">
      <h2 id="mapa-tab-heading" className="text-h2 font-display">
        Familias por distrito
      </h2>
      <MapaChoropleth rows={data.rows} kAnonymityFloor={data.kAnonymityFloor} />
    </section>
  );
}
