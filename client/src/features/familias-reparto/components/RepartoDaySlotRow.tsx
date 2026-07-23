import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { weekdayLongOf } from "../utils/calendar";

type Turno = "manana" | "tarde";
type TurnoMode = Turno | "ambos";

interface Props {
  date: string;
  mananaActive: boolean;
  tardeActive: boolean;
  /** whether this turno is the reserved fuera-de-Madrid slot */
  mananaFuera?: boolean;
  tardeFuera?: boolean;
  onSetTurno: (mode: TurnoMode) => void;
}

/** One selected day of a reparto: mañana/tarde/ambos toggle.
 *  Cupos are no longer set here — they are reference-only and computed
 *  server-side at activation. A fuera-de-Madrid badge marks the reserved slot. */
export function RepartoDaySlotRow(props: Props) {
  const { date, mananaActive, tardeActive, onSetTurno } = props;
  const mode: TurnoMode = mananaActive && tardeActive ? "ambos" : tardeActive ? "tarde" : "manana";
  const dayNum = parseInt(date.split("-")[2], 10);
  const fuera = { manana: props.mananaFuera ?? false, tarde: props.tardeFuera ?? false };
  const active = { manana: mananaActive, tarde: tardeActive };

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-sm font-semibold">
          {weekdayLongOf(date)} {dayNum}
        </p>
        {(["manana", "tarde"] as const).map((t) =>
          active[t] && fuera[t] ? (
            <Badge key={t} variant="secondary" className="text-xs">
              Fuera de Madrid
            </Badge>
          ) : null,
        )}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={`Turno del día ${dayNum}`}>
        {(["manana", "tarde", "ambos"] as const).map((t) => (
          <Button
            key={t}
            type="button"
            size="sm"
            variant={mode === t ? "default" : "outline"}
            aria-pressed={mode === t}
            onClick={() => onSetTurno(t)}
          >
            {t === "manana" ? "Mañana" : t === "tarde" ? "Tarde" : "Ambos"}
          </Button>
        ))}
      </div>
    </div>
  );
}
