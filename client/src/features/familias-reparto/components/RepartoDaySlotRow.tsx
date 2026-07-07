import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { weekdayLongOf } from "../utils/calendar";

type Turno = "manana" | "tarde";
type TurnoMode = Turno | "ambos";

interface Props {
  date: string;
  mananaActive: boolean;
  tardeActive: boolean;
  /** people (cupo) currently assigned to each turno by the equal split */
  mananaPeople: number;
  tardePeople: number;
  /** whether the operator has manually fixed each turno's number */
  mananaFixed: boolean;
  tardeFixed: boolean;
  /** whether each turno is the reserved fuera-de-Madrid slot (count-driven above) */
  mananaFuera?: boolean;
  tardeFuera?: boolean;
  onSetTurno: (mode: TurnoMode) => void;
  onSetPersonas: (turno: Turno, raw: string) => void;
}

/** One selected day of a reparto: mañana/tarde/ambos toggle plus the editable
 *  "personas" (cupo) per active turno. Editing a number fixes that turno; the
 *  rest rebalance in the parent form. */
export function RepartoDaySlotRow(props: Props) {
  const { date, mananaActive, tardeActive, onSetTurno, onSetPersonas } = props;
  const mode: TurnoMode = mananaActive && tardeActive ? "ambos" : tardeActive ? "tarde" : "manana";
  const dayNum = parseInt(date.split("-")[2], 10);

  const people = { manana: props.mananaPeople, tarde: props.tardePeople };
  const fixed = { manana: props.mananaFixed, tarde: props.tardeFixed };
  const active = { manana: mananaActive, tarde: tardeActive };
  const fuera = { manana: props.mananaFuera ?? false, tarde: props.tardeFuera ?? false };

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <p className="text-sm font-semibold">
        {weekdayLongOf(date)} {dayNum}
      </p>
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
      <div className="grid grid-cols-2 gap-2">
        {(["manana", "tarde"] as const).map((t) =>
          active[t] ? (
            <div key={t} className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Label htmlFor={`personas-${t}-${date}`} className="text-xs">
                  Personas {t === "manana" ? "mañana" : "tarde"}
                </Label>
                {fuera[t] ? (
                  <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                    Fuera de Madrid
                  </Badge>
                ) : (
                  fixed[t] && (
                    <Badge variant="outline" className="h-4 px-1 text-[10px]">
                      fijado
                    </Badge>
                  )
                )}
              </div>
              <Input
                id={`personas-${t}-${date}`}
                type="number"
                min={0}
                value={String(people[t])}
                onChange={(e) => onSetPersonas(t, e.target.value)}
                disabled={fuera[t]}
                title={fuera[t] ? "Se controla en «Personas de fuera de Madrid»" : undefined}
                className="h-8 text-sm"
              />
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}
