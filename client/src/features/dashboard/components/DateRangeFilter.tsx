/**
 * DateRangeFilter — v4 restyle: pill buttons matching prototype.
 * Active pill uses primary background. Adds "Año" option (ytd) as display-only
 * since the router only handles today/week/month — ytd falls back to month.
 */
import type { Period } from "../schemas";

interface DateRangeFilterProps {
  value: Period;
  onChange: (period: Period) => void;
}

const OPTIONS: { value: Period; label: string }[] = [
  { value: "today", label: "Hoy" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
];

export function DateRangeFilter({ value, onChange }: DateRangeFilterProps) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto" role="group" aria-label="Período">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={[
            "text-xs font-semibold px-3 py-1.5 rounded-full border transition shrink-0",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === opt.value
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card text-foreground border-border hover:bg-accent hover:text-accent-foreground",
          ].join(" ")}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
