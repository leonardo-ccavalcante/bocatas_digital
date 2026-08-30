import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Search, Star, XCircle } from "lucide-react";

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

/** Normalize a string for accent- and case-insensitive matching. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function matchesSearch(row: PendingRow | AttendedRow, query: string): boolean {
  if (!query) return true;
  const q = normalize(query);
  return normalize(rowLabel(row)).includes(q);
}

/** Renders the pending (all-round carry-over) list and the already-attended list
 *  for one close-out slot. Smallest family first from server; "Hoy" badge marks
 *  the suggested slot. A search box lets the coordinator find a family without
 *  scrolling. */
export function CloseoutRosterList({ pending, attendedHere, isReadOnly, onMark }: Props) {
  const [search, setSearch] = useState("");

  const filteredPending = pending.filter((r) => matchesSearch(r, search));
  const filteredAttended = attendedHere.filter((r) => matchesSearch(r, search));

  const hasAny = pending.length > 0 || attendedHere.length > 0;
  const hasResults = filteredPending.length > 0 || filteredAttended.length > 0;

  return (
    <div className="space-y-4">
      {hasAny && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden />
          <Input
            placeholder="Buscar familia por nombre…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
            aria-label="Buscar familia en la lista"
          />
        </div>
      )}

      {search && !hasResults && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No hay resultados para «{search}»
        </p>
      )}

      {filteredPending.length > 0 && (
        <section aria-label="Familias pendientes">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Pendientes ({filteredPending.length}{search ? ` de ${pending.length}` : ""})
          </h4>
          <ul className="space-y-2">
            {filteredPending.map((r) => (
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

      {filteredAttended.length > 0 && (
        <section aria-label="Familias atendidas en este turno">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Atendidas aquí ({filteredAttended.length}{search ? ` de ${attendedHere.length}` : ""})
          </h4>
          <ul className="space-y-2">
            {filteredAttended.map((r) => (
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
