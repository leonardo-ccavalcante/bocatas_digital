import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Star, XCircle } from "lucide-react";

interface PendingRow {
  id: string;
  family_id: string;
  expediente: string | null;
  total_miembros: number;
  nombre_titular: string | null;
  /** true when this family's suggested slot matches the current one */
  es_sugerido: boolean;
}

interface AttendedRow {
  id: string;
  family_id: string;
  expediente: string | null;
  total_miembros: number;
  nombre_titular: string | null;
  attended: boolean | null;
}

interface Props {
  pending: PendingRow[];
  attendedHere: AttendedRow[];
  /** Read-only when the slot is cerrado. */
  isReadOnly: boolean;
  onMark: (assignmentId: string, label: string, attended: boolean) => void;
}

function rowLabel(row: PendingRow | AttendedRow): string {
  return row.nombre_titular ?? `Expediente #${row.expediente ?? row.family_id.slice(0, 8)}`;
}

/** Renders the pending (all-round carry-over) list and the already-attended list
 *  for one close-out slot. Smallest family first from server; "Hoy" badge marks
 *  the suggested slot. */
export function CloseoutRosterList({ pending, attendedHere, isReadOnly, onMark }: Props) {
  return (
    <div className="space-y-4">
      {pending.length > 0 && (
        <section aria-label="Familias pendientes">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Pendientes ({pending.length})
          </h4>
          <ul className="space-y-2">
            {pending.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 rounded-lg border p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-medium truncate">{rowLabel(r)}</p>
                    {r.es_sugerido && (
                      <Badge variant="secondary" className="flex items-center gap-1 text-xs">
                        <Star className="h-3 w-3" aria-hidden />
                        Hoy
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {r.total_miembros} persona{r.total_miembros !== 1 ? "s" : ""}
                  </p>
                </div>
                {!isReadOnly && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="min-h-[44px] min-w-[44px] gap-1"
                      aria-label={`Atender ${rowLabel(r)}`}
                      onClick={() => onMark(r.id, rowLabel(r), true)}
                    >
                      <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden />
                      <span className="hidden sm:inline text-xs">Atender</span>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="min-h-[44px] min-w-[44px] gap-1 text-muted-foreground"
                      aria-label={`Marcar ausente ${rowLabel(r)}`}
                      onClick={() => onMark(r.id, rowLabel(r), false)}
                    >
                      <XCircle className="h-4 w-4 text-red-400" aria-hidden />
                      <span className="hidden sm:inline text-xs">Ausente</span>
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {attendedHere.length > 0 && (
        <section aria-label="Familias atendidas en este turno">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Atendidas aquí ({attendedHere.length})
          </h4>
          <ul className="space-y-2">
            {attendedHere.map((r) => (
              <li
                key={r.id}
                className={`flex items-center gap-2 rounded-lg border p-3 ${
                  r.attended === true
                    ? "border-green-200 bg-green-50"
                    : "border-red-200 bg-red-50"
                }`}
              >
                {r.attended === true ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" aria-label="Atendida" />
                ) : (
                  <XCircle className="h-5 w-5 shrink-0 text-red-500" aria-label="Ausente" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{rowLabel(r)}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.total_miembros} persona{r.total_miembros !== 1 ? "s" : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pending.length === 0 && attendedHere.length === 0 && (
        <p className="text-sm text-muted-foreground">No hay familias en este turno.</p>
      )}
    </div>
  );
}
