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
 *
 * MYT-121 (gh #121): the virtualized list components and the filter/counts
 * memos were extracted to Personas.lists.tsx / Personas.hooks.ts to bring this
 * file back under the 300-line max-lines cap. Behavior is UNCHANGED — see
 * those files for the relocated perf-critical code.
 */
import { useState, useCallback, useEffect, useRef, lazy, Suspense } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useSearchPersons } from "@/features/persons/hooks/useSearchPersons";
import { PersonsFilterBar } from "@/features/persons/components/PersonsFilterBar";
import { PersonasSearchView } from "@/features/persons/components/PersonasSearchView";
import { PersonsEmptyState } from "@/features/persons/components/PersonsEmptyState";
import { BuscarPorQrButton } from "@/features/persons/components/BuscarPorQrButton";
import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { usePersonsData } from "@/pages/Personas.hooks";
import { VirtualizedDesktopList, VirtualizedMobileList } from "@/pages/Personas.lists";
import { PERSONS_DIRECTORY_FULL_LIMIT } from "@/features/persons/constants";
import type { BocatasRole } from "@/components/layout/ProtectedRoute";
import type { EstadoFilter, SortBy } from "@/features/persons/components/PersonsFilterBar";

// ─── Constants ────────────────────────────────────────────────────────────────

const SCROLL_KEY = "personas-scroll-top";
/** Estimated row heights for the virtualizer (actual heights may vary slightly). */
const ROW_HEIGHT_DESKTOP = 57; // py-3 + content ≈ 57px
const ROW_HEIGHT_MOBILE = 74;  // p-3 + content ≈ 74px

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
  // Admin path: getAll + client-side filter.
  // MYT-80-ATL03: getAll is now server-paginated ({ data, total }) instead of
  // an unbounded fetch — see server/routers/persons/crud.ts. This page
  // filters/counts/searches over the FULL person set client-side (not a
  // paginated UI — see Personas.hooks.ts usePersonsData), so it explicitly requests
  // PERSONS_DIRECTORY_FULL_LIMIT rows rather than relying on the server's
  // bounded default, which would silently truncate the directory. staleTime
  // avoids re-fetching on every focus/mount within the same minute.
  const { data: getAllResponse, isLoading: loadingAll } =
    trpc.persons.getAll.useQuery(
      { limit: PERSONS_DIRECTORY_FULL_LIMIT },
      { enabled: isAdmin, staleTime: 60_000 }
    );
  const allPersons = getAllResponse?.data ?? [];

  // Non-admin path: search query (requires ≥2 chars)
  const { data: searchResults, isLoading: loadingSearch, isFetching } =
    useSearchPersons(query);

  // ── Normalise + filter + counts (extracted — MYT-121) ─────────────────────
  const { searchRows, filteredRows, counts } = usePersonsData({
    isAdmin,
    allPersons,
    searchResults,
    query,
    estadoFilter,
    faseFilter,
    sortBy,
  });

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

      {/* Buscar por QR: la persona llega con su código y se abre su ficha.
          Va aquí y no dentro de PersonsFilterBar porque ese fichero está en
          298 líneas y el cap de max-lines es 300. */}
      <div className="max-w-5xl mx-auto w-full px-4 sm:px-8 pt-3">
        <BuscarPorQrButton />
      </div>

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
              <div className="grid grid-cols-[1fr_170px_120px_100px_80px] gap-3 px-5 py-3 text-eyebrow text-muted-foreground border-b border-border bg-muted/30">
                <span>Persona</span>
                <span>Programas</span>
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
