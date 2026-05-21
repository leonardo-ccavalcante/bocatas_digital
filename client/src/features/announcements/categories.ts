/**
 * categories.ts — Color / style map for the real TipoAnnouncement enum.
 *
 * Enum values come from shared/announcementTypes.ts:
 *   info | evento | cierre_servicio | convocatoria
 *
 * These are the ONLY current (non-legacy) values. Legacy values "urgente" and
 * "cierre" are rejected for new writes (migration 20260501000003 CHECK constraint).
 * Urgency is represented by the boolean `es_urgente` on the row — handled
 * separately in the UI with an urgency badge rather than a category color.
 *
 * Tailwind utility classes are used exclusively (no raw hex) per project rules.
 */

import { ANNOUNCEMENT_TYPE_LABELS, type TipoAnnouncement } from "@shared/announcementTypes";

export interface CategoryMeta {
  /** Short display label shown in the category chip */
  label: string;
  /** Tailwind classes for the chip background + text + border */
  chipClass: string;
  /** Tailwind indicator dot color class (for the category pill in the filter row) */
  dotClass: string;
  /**
   * Tailwind class for the progress bar fill color in the reach bar.
   * Used via inline style width + this class for color.
   */
  progressClass: string;
}

// Labels derived from shared/announcementTypes.ts — ANNOUNCEMENT_TYPE_LABELS is
// the single source of truth for Spanish display strings. Do not re-type them here.
export const CATEGORY_META: Record<TipoAnnouncement, CategoryMeta> = {
  info: {
    label: ANNOUNCEMENT_TYPE_LABELS.info,
    chipClass: "bg-blue-50 text-blue-700 border-blue-200",
    dotClass: "bg-blue-500",
    progressClass: "bg-blue-500",
  },
  evento: {
    label: ANNOUNCEMENT_TYPE_LABELS.evento,
    chipClass: "bg-green-50 text-green-700 border-green-200",
    dotClass: "bg-green-600",
    progressClass: "bg-green-600",
  },
  cierre_servicio: {
    label: ANNOUNCEMENT_TYPE_LABELS.cierre_servicio,
    chipClass: "bg-orange-50 text-orange-700 border-orange-200",
    dotClass: "bg-orange-500",
    progressClass: "bg-orange-500",
  },
  convocatoria: {
    label: ANNOUNCEMENT_TYPE_LABELS.convocatoria,
    chipClass: "bg-purple-50 text-purple-700 border-purple-200",
    dotClass: "bg-purple-600",
    progressClass: "bg-purple-600",
  },
};

/** Fallback when tipo is missing or legacy (e.g. old "urgente" rows still in DB) */
export const CATEGORY_META_FALLBACK: CategoryMeta = {
  label: "Info",
  chipClass: "bg-muted text-muted-foreground border-border",
  dotClass: "bg-muted-foreground",
  progressClass: "bg-muted-foreground",
};

export function getCategoryMeta(tipo: string): CategoryMeta {
  return CATEGORY_META[tipo as TipoAnnouncement] ?? CATEGORY_META_FALLBACK;
}
