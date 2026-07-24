/**
 * Personas.hooks.ts — usePersonsData.
 *
 * Extracted from Personas.tsx (MYT-121, gh #121) to bring the page file back
 * under the 300-line max-lines cap. Normalises the two person-list data
 * sources (admin `getAll` / non-admin `search`) into PersonRowData, applies
 * the client-side filter/sort, and computes filter-pill counts in a single
 * O(N) pass. Behavior is UNCHANGED from the pre-split Personas.tsx (v6 perf
 * work from #118) — this is a pure relocation, not a rewrite.
 *
 * persons.getAll uses .select(dynamicString) server-side, which causes
 * Supabase's type-level parser to emit GenericStringError instead of a real
 * row type. We use the database Row type directly — it is the accurate
 * runtime shape and the canonical source of truth for this table.
 */
import { useMemo } from "react";
import type { Database } from "@/lib/database.types";
import type { PersonRowData } from "@/features/persons/components/PersonRowDesktop";
import type { EstadoFilter, SortBy } from "@/features/persons/components/PersonsFilterBar";
import type { PersonSearchResult } from "@/features/persons/hooks/useSearchPersons";

type PersonRow = Database["public"]["Tables"]["persons"]["Row"];

function deriveEstado(p: PersonRowData): string {
  return p.fase_itinerario ? "Activa" : "Inactiva";
}

export interface PersonsCounts {
  total: number;
  filtered: number;
  byEstado: Record<EstadoFilter, number>;
  byFase: Record<string, number>;
  fases: string[];
}

export interface UsePersonsDataParams {
  isAdmin: boolean;
  allPersons: unknown[];
  searchResults: PersonSearchResult[] | undefined;
  query: string;
  estadoFilter: EstadoFilter;
  faseFilter: string;
  sortBy: SortBy;
}

export interface UsePersonsDataResult {
  searchRows: PersonRowData[];
  filteredRows: PersonRowData[];
  counts: PersonsCounts;
}

export function usePersonsData({
  isAdmin,
  allPersons,
  searchResults,
  query,
  estadoFilter,
  faseFilter,
  sortBy,
}: UsePersonsDataParams): UsePersonsDataResult {
  // ── Normalise to PersonRowData ────────────────────────────────────────────
  const adminRows: PersonRowData[] = useMemo(
    () =>
      (allPersons as unknown as PersonRow[]).map((p) => ({
        id: p.id,
        nombre: p.nombre,
        apellidos: p.apellidos ?? null,
        fase_itinerario: p.fase_itinerario ?? null,
        created_at: p.created_at ?? null,
        foto_perfil_url: p.foto_perfil_url ?? null,
      })),
    [allPersons]
  );

  const searchRows: PersonRowData[] = useMemo(
    () =>
      (searchResults ?? []).map((p) => ({
        id: p.id,
        nombre: p.nombre,
        apellidos: p.apellidos ?? null,
        fase_itinerario: p.fase_itinerario ?? null,
        created_at: null,
        foto_perfil_url: p.foto_perfil_url ?? null,
      })),
    [searchResults],
  );

  // ── Client-side filtering (admin path only — search is server-filtered) ───
  const filteredRows: PersonRowData[] = useMemo(() => {
    if (!isAdmin) return searchRows;

    let rows = adminRows;

    // Text filter over getAll rows when query is typed
    if (query.trim().length >= 1) {
      const q = query.trim().toLowerCase();
      rows = rows.filter((p) =>
        [p.nombre, p.apellidos ?? "", p.id]
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }

    // Estado filter
    if (estadoFilter !== "todas") {
      rows = rows.filter((p) => deriveEstado(p) === estadoFilter);
    }

    // Fase filter
    if (faseFilter !== "todas") {
      rows = rows.filter((p) => p.fase_itinerario === faseFilter);
    }

    // Sort — pre-compute timestamps to avoid new Date() inside comparator
    if (sortBy === "name") {
      rows = [...rows].sort((a, b) =>
        (a.apellidos ?? a.nombre).localeCompare(b.apellidos ?? b.nombre, "es")
      );
    } else {
      // recent: newest created_at first — pre-compute ms timestamps O(N)
      const withTs = rows.map((p) => ({
        p,
        ts: p.created_at ? new Date(p.created_at).getTime() : 0,
      }));
      withTs.sort((a, b) => b.ts - a.ts);
      rows = withTs.map((x) => x.p);
    }

    return rows;
  }, [isAdmin, adminRows, searchRows, query, estadoFilter, faseFilter, sortBy]);

  // ── Counts for filter pills — single O(N) pass ────────────────────────────
  const counts: PersonsCounts = useMemo(() => {
    const base = isAdmin ? adminRows : searchRows;

    // Single pass: accumulate all counts simultaneously
    const byEstado: Record<EstadoFilter, number> = { todas: base.length, Activa: 0, Inactiva: 0 };
    const byFase: Record<string, number> = { todas: base.length };
    const faseSet = new Set<string>();

    for (const p of base) {
      const estado = deriveEstado(p);
      if (estado === "Activa") byEstado.Activa++;
      else byEstado.Inactiva++;

      if (p.fase_itinerario) {
        faseSet.add(p.fase_itinerario);
        byFase[p.fase_itinerario] = (byFase[p.fase_itinerario] ?? 0) + 1;
      }
    }

    const fases = Array.from(faseSet).sort();
    return { total: base.length, filtered: filteredRows.length, byEstado, byFase, fases };
  }, [isAdmin, adminRows, searchRows, filteredRows]);

  return { searchRows, filteredRows, counts };
}
