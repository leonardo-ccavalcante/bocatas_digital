/**
 * useMapaData — TanStack Query hook wrapping trpc.mapa.distritoStats.
 *
 * Returns rows, kAnonymityFloor, isLoading, and isError in a flat shape that
 * MapaChoropleth and the parent composer can consume directly.
 */

import { trpc } from "@/lib/trpc";
import type { DistritoStatRow } from "../../../../../server/routers/mapa";

export interface MapaDataResult {
  rows: DistritoStatRow[];
  kAnonymityFloor: number;
  isLoading: boolean;
  isError: boolean;
  error?: Error | null;
}

export function useMapaData(layer: "densidad" | "compliance"): MapaDataResult {
  const query = trpc.mapa.distritoStats.useQuery({ layer });

  return {
    rows: query.data?.rows ?? [],
    kAnonymityFloor: query.data?.kAnonymityFloor ?? 3,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null | undefined,
  };
}
