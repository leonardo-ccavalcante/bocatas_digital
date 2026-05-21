/**
 * NovedadFeed.tsx — Partitioned + time-bucketed announcement feed.
 *
 * Renders:
 *  1. "Anclados" section (pinned items)
 *  2. Time buckets: Hoy / Esta semana / Anteriores
 *  3. Empty state with a clear-filters callback
 *
 * Splits complex feed logic out of Novedades.tsx to keep both files < 400 lines.
 */

import { Pin, Bell } from "lucide-react";
import { partitionFeed, BUCKET_ORDER } from "../feedHelpers";
import { NovedadItem, type AnnouncementFeedRow } from "./NovedadItem";

interface NovedadFeedProps {
  items: AnnouncementFeedRow[];
  onClearFilters: () => void;
}

function SectionHeader({
  title,
  icon,
}: {
  title: string;
  icon?: React.ReactNode;
}) {
  return (
    <h2 className="flex items-center gap-1.5 text-eyebrow text-muted-foreground mb-2">
      {icon}
      {title}
    </h2>
  );
}

export function NovedadFeed({ items, onClearFilters }: NovedadFeedProps) {
  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="mx-auto h-12 w-12 rounded-full flex items-center justify-center mb-4 bg-accent">
          <Bell className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <p className="text-h3 text-foreground">Sin novedades</p>
        <p className="text-body-sm text-muted-foreground mt-1">
          No hay avisos que coincidan con este filtro.
        </p>
        <button
          type="button"
          onClick={onClearFilters}
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold border border-border bg-card hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          Limpiar filtros
        </button>
      </div>
    );
  }

  const { pinned, buckets } = partitionFeed(items, new Date());

  return (
    <div className="space-y-6" role="feed" aria-label="Novedades">
      {pinned.length > 0 && (
        <section aria-label="Anclados">
          <SectionHeader
            title="Anclados"
            icon={<Pin className="h-3.5 w-3.5" aria-hidden="true" />}
          />
          <div className="space-y-3">
            {pinned.map((item) => (
              <NovedadItem key={item.id} announcement={item} />
            ))}
          </div>
        </section>
      )}

      {BUCKET_ORDER.map((label) => {
        const list = buckets[label];
        if (list.length === 0) return null;
        return (
          <section key={label} aria-label={label}>
            <SectionHeader title={label} />
            <div className="space-y-3">
              {list.map((item) => (
                <NovedadItem key={item.id} announcement={item} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
