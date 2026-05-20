/**
 * DistritoPanel — shadcn Sheet side panel shown when a district polygon is clicked.
 *
 * Displays: district name, family count (or k-anon suppression message), compliance
 * ratio (compliance layer only), and a "Ver familias" CTA that deep-links to the
 * familias tab with the district filter pre-applied.
 *
 * No PII is surfaced — only counts and distrito names.
 */

import { Link } from "wouter";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { DISTRITO_LABELS } from "@shared/madrid/distritos";

import type { DistritoStatRow } from "../../../../server/routers/mapa";

interface DistritoPanelProps {
  open: boolean;
  onClose: () => void;
  row: DistritoStatRow;
  kAnonymityFloor: number;
  layer: "densidad" | "compliance";
}

export function DistritoPanel({
  open,
  onClose,
  row,
  kAnonymityFloor,
  layer,
}: DistritoPanelProps) {
  const label = DISTRITO_LABELS[row.distrito];
  const isSuppressed = row.count === null;

  function buildStat(): string {
    if (isSuppressed) {
      return `<${kAnonymityFloor} familias`;
    }
    if (layer === "compliance" && row.compliance != null) {
      const pct = Math.round(row.compliance * 100);
      return `${pct}% compliance · ${row.count} familias`;
    }
    return `${row.count} familias`;
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <SheetContent side="right" aria-label={`Detalle de ${label}`}>
        <SheetHeader>
          <SheetTitle className="font-display">{label}</SheetTitle>
          <SheetDescription>
            {buildStat()}
          </SheetDescription>
        </SheetHeader>

        {!isSuppressed && (
          <SheetFooter>
            <Link
              href={`?tab=familias&distrito=${row.distrito}`}
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Ver familias &rarr;
            </Link>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
