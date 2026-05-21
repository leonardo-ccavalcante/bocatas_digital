/**
 * Personas.tsx — Person directory page (v4 visual re-skin).
 *
 * Admin/superadmin: full directory with filter pills, desktop table, mobile cards.
 * Voluntario: search-only mode (min 2 chars).
 *
 * Filter pill state (estado + fase) is applied CLIENT-SIDE because the tRPC
 * `persons.search` procedure only accepts { query: string } — no estado/fase
 * param. Adding one would change the server contract; per task rules we must
 * not do that. `persons.getAll` (admin path) likewise has no filter params.
 */
import { useState, useMemo, useCallback, useEffect } from "react";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { useSearchPersons } from "@/features/persons/hooks/useSearchPersons";
import { PersonsFilterBar } from "@/features/persons/components/PersonsFilterBar";
import { PersonRowDesktop } from "@/features/persons/components/PersonRowDesktop";
import { PersonCardMobile } from "@/features/persons/components/PersonCardMobile";
import { PersonsTable } from "@/features/persons/components/PersonsTable";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Users, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import type { Database } from "@/lib/database.types";

/**
 * persons.getAll uses .select(dynamicString) server-side, which causes
 * Supabase's type-level parser to emit GenericStringError instead of a real
 * row type. We use the database Row type directly — it is the accurate runtime
 * shape and the canonical source of truth for this table.
 */
type PersonRow = Database["public"]["Tables"]["persons"]["Row"];
import { PersonsEmptyState } from "@/features/persons/components/PersonsEmptyState";
import type { BocatasRole } from "@/components/layout/ProtectedRoute";
import type { EstadoFilter, SortBy } from "@/features/persons/components/PersonsFilterBar";
import type { PersonRowData } from "@/features/persons/components/PersonRowDesktop";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(nombre: string, apellidos: string | null): string {
  return [nombre, apellidos ?? ""]
    .join(" ")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function deriveEstado(p: PersonRowData): string {
  return p.fase_itinerario ? "Activa" : "Inactiva";
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Personas() {
  const { user } = useAuth();

  const VALID_ROLES: BocatasRole[] = [
    "superadmin",
    "admin",
    "voluntario",
    "beneficiario",
  ];
  const rawRole = user?.role as string | undefined;
  const role: BocatasRole = rawRole && VALID_ROLES.includes(rawRole as BocatasRole)
    ? (rawRole as BocatasRole)
    : "beneficiario";

  const isAdmin = role === "admin" || role === "superadmin";
  const isVoluntario = role === "voluntario";

  // ── Filter state ──────────────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>("todas");
  const [faseFilter, setFaseFilter] = useState("todas");
  const [sortBy, setSortBy] = useState<SortBy>("recent");
  const [activeIdx, setActiveIdx] = useState(-1);

  // ── Data fetching ─────────────────────────────────────────────────────────
  // Admin path: getAll + client-side filter
  const { data: allPersons = [], isLoading: loadingAll } =
    trpc.persons.getAll.useQuery(undefined, { enabled: isAdmin });

  // Non-admin path: search query (requires ≥2 chars)
  const { data: searchResults, isLoading: loadingSearch, isFetching } =
    useSearchPersons(query);

  // ── Normalise to PersonRowData ────────────────────────────────────────────
  // allPersons infers as GenericStringError[] because the server uses
  // .select(dynamicString). The double-cast via unknown is intentional:
  // the runtime value is always PersonRow[]; this is a type-bridge only.
  const adminRows: PersonRowData[] = useMemo(() => (allPersons as unknown as PersonRow[]).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    apellidos: p.apellidos ?? null,
    fase_itinerario: p.fase_itinerario ?? null,
    created_at: p.created_at ?? null,
    foto_perfil_url: p.foto_perfil_url ?? null,
  })), [allPersons]);

  const searchRows: PersonRowData[] = useMemo(() =>
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

    // Sort
    if (sortBy === "name") {
      rows = [...rows].sort((a, b) =>
        (a.apellidos ?? a.nombre).localeCompare(b.apellidos ?? b.nombre, "es")
      );
    } else {
      // recent: newest created_at first
      rows = [...rows].sort((a, b) => {
        const da = a.created_at ? new Date(a.created_at).getTime() : 0;
        const db = b.created_at ? new Date(b.created_at).getTime() : 0;
        return db - da;
      });
    }

    return rows;
  }, [isAdmin, adminRows, searchRows, query, estadoFilter, faseFilter, sortBy]);

  // ── Counts for filter pills ───────────────────────────────────────────────
  const counts = useMemo(() => {
    const base = isAdmin ? adminRows : searchRows;
    const faseSet = new Set(base.map((p) => p.fase_itinerario).filter(Boolean) as string[]);
    const fases = Array.from(faseSet).sort();

    const byEstado: Record<EstadoFilter, number> = {
      todas: base.length,
      Activa: base.filter((p) => deriveEstado(p) === "Activa").length,
      Inactiva: base.filter((p) => deriveEstado(p) === "Inactiva").length,
    };

    const byFase: Record<string, number> = { todas: base.length };
    for (const f of fases) {
      byFase[f] = base.filter((p) => p.fase_itinerario === f).length;
    }

    return { total: base.length, filtered: filteredRows.length, byEstado, byFase, fases };
  }, [isAdmin, adminRows, searchRows, filteredRows]);

  // ── Reset cursor when filters change ─────────────────────────────────────
  useEffect(() => { setActiveIdx(-1); }, [query, estadoFilter, faseFilter, sortBy]);

  // ── Keyboard navigation on list ───────────────────────────────────────────
  const onListKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(filteredRows.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(0, i - 1));
      }
    },
    [filteredRows.length],
  );

  const filtersActive =
    query.length > 0 || estadoFilter !== "todas" || faseFilter !== "todas";

  const clearFilters = () => {
    setQuery("");
    setEstadoFilter("todas");
    setFaseFilter("todas");
  };

  const isLoading = isAdmin ? loadingAll : (loadingSearch && query.trim().length >= 2);

  // ── Non-admin: show search-only UI ────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="flex flex-col h-full">
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" aria-hidden="true" />
            <h1 className="text-h3">Personas</h1>
          </div>
        </div>

        <div className="px-4 pt-4 pb-2">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              data-testid="personas-search-input"
              type="search"
              className="
                w-full h-11 pl-9 pr-4 border border-border rounded-xl
                text-body bg-card text-foreground placeholder:text-muted-foreground
                focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40
                transition
              "
              placeholder="Escribe al menos 2 caracteres para buscar…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus={isVoluntario}
              aria-label="Buscar persona"
            />
          </div>
          {query.length > 0 && query.trim().length < 2 && (
            <p className="text-body-sm text-muted-foreground mt-1.5 ml-1">
              Escribe al menos 2 caracteres.
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {isLoading || isFetching ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : query.trim().length < 2 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
              <Users className="h-12 w-12 mb-3 opacity-30" aria-hidden="true" />
              <p className="text-body font-medium">Busca una persona</p>
              <p className="text-body-sm mt-1 opacity-70">
                Escribe nombre o apellidos para encontrar una ficha.
              </p>
            </div>
          ) : searchResults?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
              <Search className="h-10 w-10 mb-3 opacity-30" aria-hidden="true" />
              <p className="text-body font-medium">Sin resultados</p>
              <p className="text-body-sm mt-1 opacity-70">
                No se encontraron personas con ese nombre.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-xl border overflow-hidden mt-2">
              {(searchResults ?? []).map((person) => (
                <li key={person.id}>
                  <Link href={`/personas/${person.id}`}>
                    <div className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors cursor-pointer">
                      <Avatar className="h-10 w-10 shrink-0">
                        {person.foto_perfil_url && (
                          <AvatarImage src={person.foto_perfil_url} alt={person.nombre} />
                        )}
                        <AvatarFallback className="bg-accent text-accent-foreground text-body font-semibold">
                          {getInitials(person.nombre, person.apellidos)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-body font-medium truncate">
                          {person.nombre} {person.apellidos ?? ""}
                        </p>
                        {person.fase_itinerario && (
                          <Badge variant="secondary" className="text-[11px] mt-0.5">
                            {person.fase_itinerario}
                          </Badge>
                        )}
                      </div>
                      <ChevronRight
                        className="h-4 w-4 text-muted-foreground shrink-0"
                        aria-hidden="true"
                      />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  // ── Admin: full directory with filter pills ───────────────────────────────

  return (
    <div
      className="min-h-full flex flex-col bg-background"
      onKeyDown={onListKeyDown}
    >
      <PersonsFilterBar
        query={query}
        onQueryChange={setQuery}
        estadoFilter={estadoFilter}
        onEstadoChange={setEstadoFilter}
        faseFilter={faseFilter}
        onFaseChange={setFaseFilter}
        sortBy={sortBy}
        onSortChange={setSortBy}
        counts={counts}
        showNewButton={isAdmin}
      />

      <div className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-8 py-5">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredRows.length === 0 ? (
          <PersonsEmptyState onClear={clearFilters} hasFilters={filtersActive} isAdmin={isAdmin} />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block bocatas-card overflow-hidden">
              {/* Column headers */}
              <div className="grid grid-cols-[1fr_130px_120px_100px_80px] gap-3 px-5 py-3 text-eyebrow text-muted-foreground border-b border-border bg-muted/30">
                <span>Persona</span>
                <span>Fase</span>
                <span>Registro</span>
                <span>Estado</span>
                <span className="text-right">Acciones</span>
              </div>
              <ul className="divide-y divide-border" aria-label="Lista de personas">
                {filteredRows.map((p, i) => (
                  <PersonRowDesktop
                    key={p.id}
                    person={p}
                    active={activeIdx === i}
                    compact={false}
                    onMouseEnter={() => setActiveIdx(i)}
                  />
                ))}
              </ul>
            </div>

            {/* Mobile cards */}
            <ul className="sm:hidden space-y-2" aria-label="Lista de personas">
              {filteredRows.map((p) => (
                <PersonCardMobile key={p.id} person={p} />
              ))}
            </ul>
          </>
        )}

        {/* Admin role-management table below the visual list */}
        {isAdmin && query.trim().length === 0 && estadoFilter === "todas" && faseFilter === "todas" && (
          <details className="mt-8">
            <summary className="cursor-pointer text-body-sm text-muted-foreground hover:text-foreground transition-colors mb-3 select-none">
              Gestión de roles y fases (admin)
            </summary>
            <PersonsTable />
          </details>
        )}
      </div>
    </div>
  );
}
