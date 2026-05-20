import { useState } from "react";
import { ChevronRight } from "lucide-react";

/* ── Collapsible info box ────────────────────────────────────────────────── */

export interface ProgramInfoBoxProps {
  activeCount: number;
  newCount: number;
  completedCount: number;
  children: React.ReactNode;
}

export function ProgramInfoBox({
  activeCount,
  newCount,
  completedCount,
  children,
}: ProgramInfoBoxProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bocatas-card overflow-hidden">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-controls="program-info-content"
        className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-background/60 transition text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <ChevronRight
            className="h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200"
            style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-body font-semibold text-foreground truncate">
              Información del programa
            </p>
          </div>
        </div>

        {/* KPI chips — summary row */}
        <div className="hidden md:flex items-center gap-1.5 shrink-0">
          <span className="text-[11px] font-semibold px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 tabular-stat">
            {activeCount} activos
          </span>
          <span className="text-[11px] font-semibold px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 tabular-stat">
            +{newCount} nuevos
          </span>
          <span className="text-[11px] font-semibold px-2 py-1 rounded-full bg-muted text-muted-foreground border border-border tabular-stat">
            {completedCount} compl/rech
          </span>
        </div>
      </button>

      {isOpen && (
        <div
          id="program-info-content"
          className="border-t border-border px-5 py-5 space-y-5 bg-background/40"
        >
          {children}
        </div>
      )}
    </div>
  );
}
