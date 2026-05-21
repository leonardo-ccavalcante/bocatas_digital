/**
 * Novedades.tsx — Announcement feed page (v4 visual port)
 *
 * Visible to all authenticated users (role-filtered on server).
 * Task 7 — Visual re-skin reproducing novedades.jsx prototype.
 *
 * Data decisions:
 *  fijado (pin):     EXISTS in server — togglePin mutation used in NovedadItem.
 *  Read/unread:      NOT in server — unread count badge and "No leídas" segment
 *                    count always show 0, tab renders with count disabled.
 *                    // TODO(frontend-v4): needs read_state field/endpoint
 *  Reach:            NOT in server — handled in NovedadItem (progress bar empty).
 *                    // TODO(frontend-v4): needs reach aggregation endpoint
 *  Category filter:  Driven by TipoAnnouncement enum (info/evento/cierre_servicio/
 *                    convocatoria). CATEGORY_META from categories.ts.
 */

import { useMemo, useState } from "react";
import { Bell } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAnnouncements } from "@/features/announcements/hooks/useAnnouncements";
import { CrearNovedadButton } from "@/components/CrearNovedadButton";
import { Skeleton } from "@/components/ui/skeleton";
import { getCategoryMeta } from "@/features/announcements/categories";
import { NovedadFeed } from "@/features/announcements/components/NovedadFeed";
import type { AnnouncementFeedRow } from "@/features/announcements/components/NovedadItem";
import { ANNOUNCEMENT_TYPES } from "@shared/announcementTypes";
import type { TipoAnnouncement } from "@shared/announcementTypes";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────────────────────

type CatFilter = "todas" | TipoAnnouncement;
// "nolei" (unread) is in the union so the ToggleGroup value is typed correctly;
// the tab remains disabled pending read_state endpoint (TODO frontend-v4)
type ViewFilter = "todas" | "ancladas" | "nolei";

// ─── Category pill ─────────────────────────────────────────────────────────────

function CatPill({
  label,
  count,
  active,
  onClick,
  dotClass,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  dotClass?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-medium transition-colors border",
        active
          ? "bg-foreground text-background border-foreground"
          : "bg-card text-foreground border-border hover:bg-accent hover:text-accent-foreground"
      )}
    >
      {dotClass && (
        <span
          className={cn("h-1.5 w-1.5 rounded-full shrink-0", dotClass)}
          aria-hidden="true"
        />
      )}
      <span>{label}</span>
      <span
        className={cn(
          "text-[10px] tabular-stat",
          active ? "text-background/70" : "text-muted-foreground"
        )}
      >
        {count}
      </span>
    </button>
  );
}

// ─── Loading skeleton ───────────────────────────────────────────────────────────

function FeedSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Cargando novedades">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-48 w-full rounded-2xl" />
      ))}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function Novedades() {
  const [catFilter, setCatFilter] = useState<CatFilter>("todas");
  const [viewFilter, setViewFilter] = useState<ViewFilter>("todas");

  const { data, isLoading, error } = useAnnouncements({ limit: 50 });

  const allAnnouncements = useMemo(
    () => (data?.announcements ?? []) as AnnouncementFeedRow[],
    [data?.announcements]
  );

  // Category counts (over unfiltered list)
  const catCounts = useMemo(() => {
    const counts: Record<string, number> = { todas: allAnnouncements.length };
    for (const tipo of ANNOUNCEMENT_TYPES) {
      counts[tipo] = allAnnouncements.filter((a) => a.tipo === tipo).length;
    }
    return counts;
  }, [allAnnouncements]);

  // Pinned count (for view segment)
  const pinnedCount = useMemo(
    () => allAnnouncements.filter((a) => a.fijado).length,
    [allAnnouncements]
  );

  // Filtered list for the feed
  const filtered = useMemo(() => {
    let result = allAnnouncements;
    if (catFilter !== "todas") result = result.filter((a) => a.tipo === catFilter);
    if (viewFilter === "ancladas") {
      result = result.filter((a) => a.fijado);
    } else if (viewFilter === "nolei") {
      // "nolei" disabled pending read-state endpoint (TODO frontend-v4)
      // Tab is rendered disabled so this branch is unreachable in practice,
      // but the union must be exhausted for type safety.
    }
    return result;
  }, [allAnnouncements, catFilter, viewFilter]);

  // TODO(frontend-v4): needs read_state field/endpoint — unread count always 0
  const unreadCount = 0;

  function handleClearFilters() {
    setCatFilter("todas");
    setViewFilter("todas");
  }

  return (
    <div className="min-h-full flex flex-col bg-background">
      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-8 pt-5 pb-3">
          {/* Title row */}
          <div className="flex items-end justify-between gap-3 mb-4">
            <div className="min-w-0">
              <p className="text-eyebrow text-muted-foreground">
                Equipo · Avisos
              </p>
              <h1 className="text-display-2 text-foreground leading-tight mt-1 flex items-center gap-3">
                Novedades
                {unreadCount > 0 && (
                  <span
                    className="inline-flex items-center justify-center text-[11px] font-bold text-primary-foreground bg-primary rounded-full px-2 h-5 tabular-stat"
                    aria-label={`${unreadCount} no leídas`}
                  >
                    {unreadCount}
                  </span>
                )}
              </h1>
            </div>
            <div className="shrink-0">
              <CrearNovedadButton />
            </div>
          </div>

          {/* Category pills */}
          <div
            className="flex items-center gap-1.5 overflow-x-auto -mx-1 px-1 pb-1"
            role="group"
            aria-label="Filtrar por categoría"
          >
            <CatPill
              label="Todas"
              count={catCounts["todas"] ?? 0}
              active={catFilter === "todas"}
              onClick={() => setCatFilter("todas")}
            />
            {ANNOUNCEMENT_TYPES.map((tipo) => {
              const meta = getCategoryMeta(tipo);
              return (
                <CatPill
                  key={tipo}
                  label={meta.label}
                  count={catCounts[tipo] ?? 0}
                  active={catFilter === tipo}
                  onClick={() => setCatFilter(tipo)}
                  dotClass={meta.dotClass}
                />
              );
            })}
          </div>

          {/* View segmented control + "Mark all read" (placeholder) */}
          <div className="mt-3 flex items-center justify-between gap-3">
            <ToggleGroup
              type="single"
              value={viewFilter}
              onValueChange={(v: ViewFilter) => {
                if (v) setViewFilter(v);
              }}
              className="bg-background rounded-lg p-0.5 border border-border gap-0"
              aria-label="Vista de novedades"
            >
              <ToggleGroupItem
                value="todas"
                className="h-7 px-2.5 text-[11px] font-medium rounded-md data-[state=on]:bg-card data-[state=on]:shadow-sm data-[state=off]:text-muted-foreground"
                aria-label="Todas las novedades"
              >
                Todas
                <span className="ml-1 text-[10px] tabular-stat text-muted-foreground">
                  {catCounts["todas"] ?? 0}
                </span>
              </ToggleGroupItem>
              <ToggleGroupItem
                value="nolei"
                className="h-7 px-2.5 text-[11px] font-medium rounded-md data-[state=on]:bg-card data-[state=on]:shadow-sm data-[state=off]:text-muted-foreground opacity-50 cursor-not-allowed"
                aria-label="No leídas (sin datos disponibles)"
                disabled
              >
                No leídas
                <span className="ml-1 text-[10px] tabular-stat text-muted-foreground">
                  {/* TODO(frontend-v4): needs read_state field/endpoint */}
                  0
                </span>
              </ToggleGroupItem>
              <ToggleGroupItem
                value="ancladas"
                className="h-7 px-2.5 text-[11px] font-medium rounded-md data-[state=on]:bg-card data-[state=on]:shadow-sm data-[state=off]:text-muted-foreground"
                aria-label="Novedades ancladas"
              >
                Ancladas
                <span className="ml-1 text-[10px] tabular-stat text-muted-foreground">
                  {pinnedCount}
                </span>
              </ToggleGroupItem>
            </ToggleGroup>

            {/* "Marcar todo leído" placeholder — no endpoint yet */}
            <span
              className="text-[12px] font-medium text-muted-foreground/50 cursor-not-allowed select-none hidden sm:inline"
              aria-hidden="true"
              title="No disponible — sin endpoint de estado de lectura"
            >
              {/* TODO(frontend-v4): needs read_state field/endpoint */}
            </span>
          </div>
        </div>
      </div>

      {/* ── Feed ── */}
      <div className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-8 py-5">
        {isLoading && <FeedSkeleton />}

        {error && !isLoading && (
          <div className="rounded-2xl bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
            <Bell className="inline h-4 w-4 mr-2" aria-hidden="true" />
            Error al cargar novedades. Inténtalo de nuevo.
          </div>
        )}

        {!isLoading && !error && (
          <NovedadFeed items={filtered} onClearFilters={handleClearFilters} />
        )}
      </div>
    </div>
  );
}
