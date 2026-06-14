/**
 * Personas.tsx — Person directory page (v5 — virtualized list).
 *
 * Admin/superadmin: full directory with filter pills, desktop table, mobile cards.
 * Voluntario: search-only mode (min 2 chars).
 *
 * v5 changes:
 * - List virtualization via @tanstack/react-virtual (only ~20 rows rendered at a time)
 * - Scroll position saved/restored via sessionStorage on unmount/mount
 * - Scroll container is the AppShell <main> element (not window)
 *
 * Filter pill state (estado + fase) is applied CLIENT-SIDE because the tRPC
 * `persons.search` procedure only accepts { query: string } — no estado/fase
 * param. Adding one would change the server contract; per task rules we must
 * not do that. `persons.getAll` (admin path) likewise has no filter params.
 */
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useAuth } from "@/_core/hooks/useAuth";
import { useSearchPersons } from "@/features/persons/hooks/useSearchPersons";
import { PersonsFilterBar } from "@/features/persons/components/PersonsFilterBar";
import { PersonRowDesktop } from "@/features/persons/components/PersonRowDesktop";
import { PersonCardMobile } from "@/features/persons/components/PersonCardMobile";
import { PersonsTable } from "@/features/persons/components/PersonsTable";
import { PersonasSearchView } from "@/features/persons/components/PersonasSearchView";
import { Loader2 } from "lucide-react";
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

// ─── Constants ────────────────────────────────────────────────────────────────

const SCROLL_KEY = "personas-scroll-top";
/** Estimated row heights for the virtualizer (actual heights may vary slightly). */
const ROW_HEIGHT_DESKTOP = 57; // py-3 + content ≈ 57px
const ROW_HEIGHT_MOBILE = 74;  // p-3 + content ≈ 74px

// ─── Helpers ─────────────────────────────────────────────────────────────────

function deriveEstado(p: PersonRowData): string {
  return p.fase_itinerario ? "Activa" : "Inactiva";
}

/** Returns the AppShell <main> scroll container (or null if not found). */
function getScrollContainer(): HTMLElement | null {
  return document.querySelector("main.flex-1.overflow-y-auto") as HTMLElement | null;
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
  const [activePersonId, setActivePersonId] = useState<string | null>(null);

  // ── Data fetching ─────────────────────────────────────────────────────────
  // Admin path: getAll + client-side filter
  const { data: allPersons = [], isLoading: loadingAll } =
    trpc.persons.getAll.useQuery(undefined, { enabled: isAdmin });

  // Non-admin path: search query (requires ≥2 chars)
  const { data: searchResults, isLoading: loadingSearch, isFetching } =
    useSearchPersons(query);

  // ── Normalise to PersonRowData ────────────────────────────────────────────
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
  useEffect(() => { setActivePersonId(null); }, [query, estadoFilter, faseFilter, sortBy]);

  // ── Scroll restoration ────────────────────────────────────────────────────
  // Save scroll position on unmount; restore it on mount (after data loads).
  const scrollRestoredRef = useRef(false);

  useEffect(() => {
    // Restore scroll position once data is loaded and list is rendered
    if (!isAdmin || loadingAll || scrollRestoredRef.current) return;
    const saved = sessionStorage.getItem(SCROLL_KEY);
    if (saved) {
      const scrollEl = getScrollContainer();
      if (scrollEl) {
        scrollEl.scrollTop = parseInt(saved, 10);
        scrollRestoredRef.current = true;
      }
    }
  }, [isAdmin, loadingAll, filteredRows.length]);

  useEffect(() => {
    // Save scroll position on unmount
    return () => {
      const scrollEl = getScrollContainer();
      if (scrollEl) {
        sessionStorage.setItem(SCROLL_KEY, String(scrollEl.scrollTop));
      }
    };
  }, []);

  // ── Keyboard navigation on list ───────────────────────────────────────────
  const onListKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const currentIdx = filteredRows.findIndex((p) => p.id === activePersonId);
        const nextIdx = Math.min(filteredRows.length - 1, currentIdx + 1);
        if (nextIdx >= 0 && nextIdx < filteredRows.length) {
          setActivePersonId(filteredRows[nextIdx].id);
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const currentIdx = filteredRows.findIndex((p) => p.id === activePersonId);
        const prevIdx = Math.max(0, currentIdx - 1);
        if (prevIdx >= 0 && prevIdx < filteredRows.length) {
          setActivePersonId(filteredRows[prevIdx].id);
        }
      }
    },
    [filteredRows, activePersonId],
  );

  const filtersActive =
    query.length > 0 || estadoFilter !== "todas" || faseFilter !== "todas";

  const clearFilters = () => {
    setQuery("");
    setEstadoFilter("todas");
    setFaseFilter("todas");
  };

  const isLoading = isAdmin ? loadingAll : (loadingSearch && query.trim().length >= 2);

  // ── Non-admin: search-only UI ─────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <PersonasSearchView
        query={query}
        onQueryChange={setQuery}
        autoFocus={isVoluntario}
        isLoading={isLoading || isFetching}
        results={searchRows}
      />
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
            {/* Desktop table — virtualized */}
            <div className="hidden sm:block bocatas-card overflow-hidden">
              <div className="grid grid-cols-[1fr_130px_120px_100px_80px] gap-3 px-5 py-3 text-eyebrow text-muted-foreground border-b border-border bg-muted/30">
                <span>Persona</span>
                <span>Fase</span>
                <span>Registro</span>
                <span>Estado</span>
                <span className="text-right">Acciones</span>
              </div>
              <VirtualizedDesktopList
                rows={filteredRows}
                activePersonId={activePersonId}
                onMouseEnter={setActivePersonId}
                rowHeight={ROW_HEIGHT_DESKTOP}
              />
            </div>

            {/* Mobile cards — virtualized */}
            <VirtualizedMobileList
              rows={filteredRows}
              rowHeight={ROW_HEIGHT_MOBILE}
            />
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

// ─── Virtualized Desktop List ─────────────────────────────────────────────────

interface VirtualizedDesktopListProps {
  rows: PersonRowData[];
  activePersonId: string | null;
  onMouseEnter: (id: string) => void;
  rowHeight: number;
}

function VirtualizedDesktopList({
  rows,
  activePersonId,
  onMouseEnter,
  rowHeight,
}: VirtualizedDesktopListProps) {
  // The scroll container is the AppShell <main> element.
  const scrollEl = getScrollContainer();

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollEl,
    estimateSize: () => rowHeight,
    overscan: 5,
  });

  const items = virtualizer.getVirtualItems();
  const totalHeight = virtualizer.getTotalSize();

  return (
    <ul
      aria-label="Lista de personas"
      className="relative"
      style={{ height: `${totalHeight}px` }}
    >
      {items.map((virtualItem) => {
        const p = rows[virtualItem.index];
        return (
          <PersonRowDesktop
            key={p.id}
            person={p}
            active={activePersonId === p.id}
            compact={false}
            onMouseEnter={() => onMouseEnter(p.id)}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`,
              borderBottom: "1px solid var(--border)",
            }}
          />
        );
      })}
    </ul>
  );
}

// ─── Virtualized Mobile List ──────────────────────────────────────────────────

interface VirtualizedMobileListProps {
  rows: PersonRowData[];
  rowHeight: number;
}

function VirtualizedMobileList({ rows, rowHeight }: VirtualizedMobileListProps) {
  const scrollEl = getScrollContainer();

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollEl,
    estimateSize: () => rowHeight,
    overscan: 5,
  });

  const items = virtualizer.getVirtualItems();
  const totalHeight = virtualizer.getTotalSize();

  return (
    <ul
      aria-label="Lista de personas"
      className="sm:hidden relative"
      style={{ height: `${totalHeight}px` }}
    >
      {items.map((virtualItem) => {
        const p = rows[virtualItem.index];
        return (
          <li
            key={p.id}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${virtualItem.start}px)`,
              paddingBottom: "8px",
            }}
          >
            <PersonCardMobile person={p} />
          </li>
        );
      })}
    </ul>
  );
}
