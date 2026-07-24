/**
 * Personas.tsx — Person directory page (v6 — performance-optimised virtualizer).
 *
 * Admin/superadmin: full directory with filter pills, desktop table, mobile cards.
 * Voluntario: search-only mode (min 2 chars).
 *
 * v6 changes (perf):
 * - Fix 1: PersonsTable lazy-mounted (only when <details> is opened) to avoid
 *   rendering 999 <tr> rows + Radix <Select> portals on page load.
 * - Fix 2: Virtualizer scroll container resolved via useLayoutEffect+useRef so
 *   getScrollElement() never returns null on first render (which caused the
 *   virtualizer to render 0 items then re-render all of them).
 * - Fix 3: counts useMemo is now a single O(N) pass instead of 4 × .filter().
 * - Fix 4: filteredRows sort pre-computes timestamps to avoid new Date() per
 *   comparison (O(N log N) → O(N) pre-compute + O(N log N) sort).
 *
 * Filter pill state (estado + fase) is applied CLIENT-SIDE because the tRPC
 * `persons.search` procedure only accepts { query: string } — no estado/fase
 * param. Adding one would change the server contract; per task rules we must
 * not do that. `persons.getAll` (admin path) likewise has no filter params.
 */
import { useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef, lazy, Suspense } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useAuth } from "@/_core/hooks/useAuth";
import { useSearchPersons } from "@/features/persons/hooks/useSearchPersons";
import { PersonsFilterBar } from "@/features/persons/components/PersonsFilterBar";
import { PersonRowDesktop } from "@/features/persons/components/PersonRowDesktop";
import { PersonCardMobile } from "@/features/persons/components/PersonCardMobile";
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

/**
 * Hook that resolves the AppShell <main> scroll container via a layout effect,
 * so the ref is always populated before the virtualizer reads it.
 * This avoids the null-on-first-render bug that caused the virtualizer to
 * render 0 items and then re-render all of them.
 */
function useScrollContainer(): React.RefObject<HTMLElement | null> {
  const ref = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    ref.current = document.querySelector("main.flex-1.overflow-y-auto") as HTMLElement | null;
  }, []);
  return ref;
}

// ─── Lazy PersonsTable ────────────────────────────────────────────────────────

/**
 * PersonsTable is only mounted when the user opens the <details> accordion.
 * This avoids rendering 999 <tr> rows + Radix <Select> portals on page load,
 * which was the primary source of the 3,500ms INP.
 */
// React.lazy so the chunk is fetched only when the admin accordion opens.
// (Was `require(...)` — not defined in the Vite/ESM client bundle → ReferenceError
// crash when the <details> was opened. Codex review on #118.)
const PersonsTableLazy = lazy(() =>
  import("@/features/persons/components/PersonsTable").then((m) => ({
    default: m.PersonsTable,
  }))
);
function LazyPersonsTable() {
  const [mounted, setMounted] = useState(false);
  return (
    <details
      className="mt-8"
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open && !mounted) {
          setMounted(true);
        }
      }}
    >
      <summary className="cursor-pointer text-body-sm text-muted-foreground hover:text-foreground transition-colors mb-3 select-none">
        Gestión de roles y fases (admin)
      </summary>
      {mounted ? (
        <Suspense fallback={null}>
          <PersonsTableLazy />
        </Suspense>
      ) : null}
    </details>
  );
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
  const counts = useMemo(() => {
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
      const scrollEl = document.querySelector("main.flex-1.overflow-y-auto") as HTMLElement | null;
      if (scrollEl) {
        scrollEl.scrollTop = parseInt(saved, 10);
        scrollRestoredRef.current = true;
      }
    }
  }, [isAdmin, loadingAll, filteredRows.length]);

  useEffect(() => {
    // Save scroll position on unmount
    return () => {
      const scrollEl = document.querySelector("main.flex-1.overflow-y-auto") as HTMLElement | null;
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

        {/* Admin role-management table — lazy-mounted on <details> open */}
        {isAdmin && query.trim().length === 0 && estadoFilter === "todas" && faseFilter === "todas" && (
          <LazyPersonsTable />
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
  // Fix 2: resolve scroll container via layout effect so it's never null on
  // first render (null → virtualizer renders 0 items → re-render all items).
  const scrollContainerRef = useScrollContainer();

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollContainerRef.current,
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
  // Fix 2: same scroll container resolution via layout effect
  const scrollContainerRef = useScrollContainer();

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollContainerRef.current,
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
