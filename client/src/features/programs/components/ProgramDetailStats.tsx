import { Skeleton } from "@/components/ui/skeleton";

/* ── KPI card ────────────────────────────────────────────────────────────── */

export interface KPICardProps {
  label: string;
  value: number | undefined;
  isLoading: boolean;
  icon: React.ReactNode;
  accentClass?: string;
}

export function KPICard({
  label,
  value,
  isLoading,
  icon,
  accentClass = "text-primary",
}: KPICardProps) {
  return (
    <div className="bocatas-card p-4 flex items-start gap-3">
      <div className={`mt-0.5 shrink-0 ${accentClass}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-eyebrow text-muted-foreground truncate">{label}</p>
        {isLoading ? (
          <Skeleton className="h-7 w-12 mt-1" />
        ) : (
          <p className="tabular-stat text-[22px] sm:text-[26px] leading-none font-semibold text-foreground mt-0.5">
            {value ?? 0}
          </p>
        )}
      </div>
    </div>
  );
}

/* ── Meta cell ───────────────────────────────────────────────────────────── */

export interface MetaCellProps {
  label: string;
  value: string;
}

export function MetaCell({ label, value }: MetaCellProps) {
  return (
    <div className="bg-card rounded-xl border border-border p-3">
      <p className="text-eyebrow text-muted-foreground">{label}</p>
      <p className="text-body font-medium mt-0.5 text-foreground">{value}</p>
    </div>
  );
}
