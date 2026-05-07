import { useCallback, useMemo } from "react";
import { useLocation, useSearch } from "wouter";

export interface FamiliasFilters {
  search?: string;
  estado: "activa" | "baja" | "all";
  sinGuf: boolean;
  sinInformeSocial: boolean;
  distrito?: string;
}

export const DEFAULT_FAMILIAS_FILTERS: FamiliasFilters = {
  estado: "activa",
  sinGuf: false,
  sinInformeSocial: false,
};

/** Pure: parse filter state from a URL search string (no leading "?" required). */
export function parseFamiliasFilters(search: string): FamiliasFilters {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const estado = params.get("estado");
  return {
    search: params.get("search") ?? undefined,
    estado: estado === "baja" || estado === "all" ? estado : "activa",
    sinGuf: params.get("sin_guf") === "1",
    sinInformeSocial: params.get("sin_informe") === "1",
    distrito: params.get("distrito") ?? undefined,
  };
}

/** Pure: build a new search string with filters applied, preserving non-filter params. */
export function buildFamiliasSearch(currentSearch: string, filters: FamiliasFilters): string {
  const next = new URLSearchParams(currentSearch.startsWith("?") ? currentSearch.slice(1) : currentSearch);
  next.set("tab", "familias");
  if (filters.search) next.set("search", filters.search); else next.delete("search");
  if (filters.estado !== "activa") next.set("estado", filters.estado); else next.delete("estado");
  if (filters.sinGuf) next.set("sin_guf", "1"); else next.delete("sin_guf");
  if (filters.sinInformeSocial) next.set("sin_informe", "1"); else next.delete("sin_informe");
  if (filters.distrito) next.set("distrito", filters.distrito); else next.delete("distrito");
  return next.toString();
}

export function useFamiliasFilters() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const filters = useMemo(() => parseFamiliasFilters(search), [search]);

  const update = useCallback(
    (partial: Partial<FamiliasFilters>) => {
      const merged: FamiliasFilters = { ...filters, ...partial };
      const path = window.location.pathname;
      navigate(`${path}?${buildFamiliasSearch(search, merged)}`, { replace: false });
    },
    [filters, navigate, search],
  );

  const applyFilters = useCallback(
    (next: Partial<FamiliasFilters>) => {
      const merged: FamiliasFilters = { ...DEFAULT_FAMILIAS_FILTERS, ...next };
      const path = window.location.pathname;
      navigate(`${path}?${buildFamiliasSearch(search, merged)}`, { replace: false });
    },
    [navigate, search],
  );

  return {
    filters,
    setSearch: (s: string) => update({ search: s.trim() || undefined }),
    setEstado: (e: FamiliasFilters["estado"]) => update({ estado: e }),
    setSinGuf: (v: boolean) => update({ sinGuf: v }),
    setSinInformeSocial: (v: boolean) => update({ sinInformeSocial: v }),
    setDistrito: (d: string | undefined) => update({ distrito: d }),
    /** Apply a full or partial filter set, replacing the current state in one navigation. */
    applyFilters,
    reset: () => {
      const path = window.location.pathname;
      navigate(`${path}?tab=familias`, { replace: false });
    },
  };
}
