import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { ProgramGlyph } from "./ProgramGlyph";
import type { ProgramWithCounts } from "../schemas";

interface ProgramCardProps {
  program: ProgramWithCounts;
  isAdmin?: boolean;
  /** 1-based display index for the editorial N°XX rail. */
  index?: number;
}

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

interface KPIStripCellProps {
  label: string;
  value: string;
  valueClassName?: string;
  border?: boolean;
}

function KPIStripCell({ label, value, valueClassName, border }: KPIStripCellProps) {
  return (
    <div
      className={"px-4 py-3.5" + (border ? " border-l border-border" : "")}
    >
      <p className="text-eyebrow text-muted-foreground">{label}</p>
      <p
        className={`tabular-stat mt-1.5 text-h3 leading-none${valueClassName ? ` ${valueClassName}` : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

export function ProgramCard({ program, isAdmin, index }: ProgramCardProps) {
  const newVal =
    program.new_this_month > 0 ? `+${program.new_this_month}` : "—";
  const newIsPositive = program.new_this_month > 0;

  return (
    <Link href={`/programas/${program.slug}`}>
      <div
        className="group bocatas-card text-left h-full transition-all duration-300 active:scale-[0.99] hover:-translate-y-0.5 relative overflow-hidden flex flex-col cursor-pointer"
      >
        {/* Top rail: index + glyph */}
        <div className="px-6 pt-5 flex items-start justify-between gap-3">
          {index != null && (
            <span className="text-[10px] font-mono tracking-[0.18em] text-muted-foreground">
              N°&nbsp;{String(index).padStart(2, "0")}
            </span>
          )}
          <div className="text-accent-foreground ml-auto">
            <ProgramGlyph slug={program.slug} className="h-6 w-6" />
          </div>
        </div>

        {/* Title + description */}
        <div className="px-6 pt-4 pb-5">
          <div className="flex items-start gap-2 flex-wrap">
            <h3
              lang="es"
              className="text-[20px] sm:text-[22px] leading-[1.15] font-semibold text-foreground tracking-[-0.01em] text-wrap-balance"
            >
              {program.name}
            </h3>
            {!program.is_active && (
              <Badge variant="secondary" className="text-[9px] tracking-widest uppercase shrink-0 self-start mt-1">
                Archivado
              </Badge>
            )}
            {program.is_default && (
              <Badge variant="outline" className="text-[9px] tracking-widest uppercase shrink-0 self-start mt-1 border-accent-foreground/20 text-accent-foreground">
                Por defecto
              </Badge>
            )}
          </div>
          {program.description && (
            <p className="text-body-sm text-muted-foreground mt-2.5 line-clamp-2">
              {program.description}
            </p>
          )}
        </div>

        {/* KPI strip — only for admins who have count data */}
        {isAdmin && (
          <div className="mt-auto grid grid-cols-3 border-t border-border">
            <KPIStripCell label="Activos" value={fmt(program.active_enrollments)} />
            <KPIStripCell label="Histórico" value={fmt(program.total_enrollments)} border />
            <KPIStripCell
              label="Mes"
              value={newVal}
              valueClassName={newIsPositive ? "text-emerald-600" : undefined}
              border
            />
          </div>
        )}

        {/* Footer — responsable_id exists but no joined display name in ProgramWithCounts;
            using program.name as neutral stand-in until backend exposes responsable_nombre */}
        <div className="px-6 py-3 flex items-center justify-between border-t border-border bg-background">
          <span className="text-body-sm text-muted-foreground truncate">
            {program.name}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-foreground transition-all duration-300 group-hover:gap-2 shrink-0">
            Abrir
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
      </div>
    </Link>
  );
}
