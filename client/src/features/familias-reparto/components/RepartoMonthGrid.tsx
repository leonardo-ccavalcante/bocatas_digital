import { Button } from "@/components/ui/button";
import { WEEKDAY_SHORT, weekdayIndexOf, weekdayLongOf } from "../utils/calendar";

interface Props {
  /** ordered `YYYY-MM-DD` dates of the month */
  days: string[];
  isSelected: (date: string) => boolean;
  onToggle: (date: string) => void;
}

/** Month day-picker laid out as a real calendar: a Monday-first weekday header
 *  and each day aligned under its weekday column (leading blanks for the offset),
 *  so the operator sees which weekday each reparto day falls on. */
export function RepartoMonthGrid({ days, isSelected, onToggle }: Props) {
  if (days.length === 0) return null;
  const offset = weekdayIndexOf(days[0]);

  return (
    <div className="grid grid-cols-7 gap-1" role="group" aria-label="Días del mes">
      {WEEKDAY_SHORT.map((w) => (
        <div
          key={w}
          className="pb-1 text-center text-[11px] font-medium uppercase text-muted-foreground"
          aria-hidden="true"
        >
          {w}
        </div>
      ))}
      {Array.from({ length: offset }, (_, i) => (
        <div key={`blank-${i}`} aria-hidden="true" />
      ))}
      {days.map((date) => {
        const dayNum = parseInt(date.split("-")[2], 10);
        const selected = isSelected(date);
        return (
          <Button
            key={date}
            type="button"
            size="sm"
            variant={selected ? "default" : "outline"}
            className="h-10 w-full text-xs font-medium"
            aria-pressed={selected}
            aria-label={`${weekdayLongOf(date)} ${dayNum}`}
            onClick={() => onToggle(date)}
          >
            {dayNum}
          </Button>
        );
      })}
    </div>
  );
}
