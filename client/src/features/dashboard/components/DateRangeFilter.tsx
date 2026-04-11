/**
 * DateRangeFilter — today / week / month toggle buttons.
 * McKinsey style: clean pill buttons, no decorative elements.
 */
import type { Period } from "../schemas";

interface DateRangeFilterProps {
  value: Period;
  onChange: (period: Period) => void;
}

const OPTIONS: { value: Period; label: string }[] = [
  { value: "today", label: "Hoy" },
  { value: "week", label: "Sem" },
  { value: "month", label: "Mes" },
];

export function DateRangeFilter({ value, onChange }: DateRangeFilterProps) {
  return (
    <div className="flex rounded-lg border border-border overflow-hidden shrink-0" role="group" aria-label="Período">
      {OPTIONS.map((opt, i) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={`px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            i > 0 ? "border-l border-border" : ""
          } ${
            value === opt.value
              ? "bg-primary text-primary-foreground"
              : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
