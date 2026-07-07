import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CheckCircle2, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import { CloseoutScanner } from "./CloseoutScanner";
import {
  useAssignmentsForDay,
  useMarkAttendance,
  useUndoAttendance,
  useReassignPending,
  useRescheduleAssignment,
  useListSlots,
} from "../hooks/useReparto";
import type { Turno } from "../schemas";

interface Props {
  roundId: string;
  day: string;
  turno: Turno;
}

interface Pending {
  assignmentId: string;
  label: string;
  attended: boolean;
}

const MES_ES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
function formatSlotOpt(date: string, t: string): string {
  const [, m, d] = date.split("-");
  const mes = MES_ES[parseInt(m, 10) - 1] ?? m;
  const tl = t === "manana" ? "Mañana" : "Tarde";
  return `${parseInt(d, 10)} ${mes} · ${tl}`;
}

/** Close-out for one (day × turno) slot: mark attended/no-show + reassign. */
export function CloseoutDayView({ roundId, day, turno }: Props) {
  const { data: rows, isLoading } = useAssignmentsForDay(roundId, day, turno);
  const { data: slots } = useListSlots(roundId);
  const mark = useMarkAttendance();
  const undo = useUndoAttendance();
  const reassign = useReassignPending();
  const reschedule = useRescheduleAssignment();
  const [pending, setPending] = useState<Pending | null>(null);
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);

  const labelOf = (r: NonNullable<typeof rows>[number]) =>
    r.nombre_titular ?? `Expediente #${r.expediente ?? r.family_id.slice(0, 8)}`;

  const confirm = async () => {
    if (!pending) return;
    try {
      await mark.mutateAsync({ assignment_id: pending.assignmentId, attended: pending.attended });
      toast(`${pending.label} — ${pending.attended ? "atendida" : "ausente"}`, {
        action: { label: "Deshacer", onClick: () => { undo.mutate({ assignment_id: pending.assignmentId }); } },
        duration: 30_000,
      });
      setPending(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al marcar asistencia");
      setPending(null);
    }
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Cargando asignaciones…</p>;

  const list = rows ?? [];
  const atendidas = list.filter((r) => r.attended === true).length;
  const ausentes = list.filter((r) => r.attended === false).length;
  const pendientes = list.filter((r) => r.attended === null).length;

  // Open slots for reassignment: exclude the current one
  const openSlots = (slots ?? []).filter(
    (s) => s.estado === "abierto" && !(s.slot_date === day && s.turno === turno),
  );

  // A closed turno is finalised: its attendance is immutable (enforced by the DB
  // guard trigger). Render it read-only — no scanner, no mark/reassign actions —
  // so volunteers aren't offered writes that would only bounce back as CONFLICT.
  const currentClosed = (slots ?? []).some(
    (s) => s.slot_date === day && s.turno === turno && s.estado === "cerrado",
  );

  const onScanResolved = (assignmentId: string) => {
    const row = list.find((r) => r.id === assignmentId);
    setPending({ assignmentId, label: row ? labelOf(row) : "Familia", attended: true });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {atendidas} atendidas · {ausentes} ausentes · {pendientes} pendientes
        </p>
        {!currentClosed && (pendientes > 0 || ausentes > 0) && openSlots.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            disabled={reassign.isPending}
            onClick={async () => {
              try {
                const res = await reassign.mutateAsync({
                  round_id: roundId,
                  from_slot: { date: day, turno },
                });
                toast.success(`${res.moved} familia(s) reprogramada(s) a turnos siguientes`);
              } catch (err: unknown) {
                toast.error(err instanceof Error ? err.message : "Error al reprogramar");
              }
            }}
          >
            Reprogramar pendientes
          </Button>
        )}
      </div>

      {currentClosed ? (
        <p className="rounded-md border border-muted bg-muted/40 p-2 text-sm text-muted-foreground" role="status">
          Turno cerrado — registro de asistencia en solo lectura.
        </p>
      ) : (
        <CloseoutScanner roundId={roundId} currentDay={day} currentTurno={turno} onResolved={onScanResolved} />
      )}

      <ul className="space-y-2">
        {list.map((r) => (
          <li
            key={r.id}
            className={`flex flex-col gap-2 rounded-lg border p-3 ${
              r.attended === true ? "border-green-200 bg-green-50"
                : r.attended === false ? "border-red-200 bg-red-50" : ""
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{labelOf(r)}</p>
                <p className="text-xs text-muted-foreground">
                  {r.total_miembros} personas
                  {r.estado_contacto === "reprogramada" && (
                    <Badge variant="outline" className="ml-2 text-xs">reprogramada</Badge>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {r.attended === true && <CheckCircle2 className="h-5 w-5 text-green-600" aria-label="Atendida" />}
                {r.attended === false && <XCircle className="h-5 w-5 text-red-500" aria-label="Ausente" />}
                {r.attended === null && (
                  <>
                    <Clock className="h-4 w-4 text-muted-foreground" aria-label="Pendiente" />
                    <Button size="sm" variant="outline" aria-label="Marcar atendida"
                      onClick={() => setPending({ assignmentId: r.id, label: labelOf(r), attended: true })}>
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    </Button>
                    <Button size="sm" variant="outline" aria-label="Marcar ausente"
                      onClick={() => setPending({ assignmentId: r.id, label: labelOf(r), attended: false })}>
                      <XCircle className="h-4 w-4 text-red-500" />
                    </Button>
                  </>
                )}
              </div>
            </div>
            {openSlots.length > 0 && r.attended === null && (
              <div className="flex items-center gap-2">
                {reschedulingId === r.id ? (
                  <select
                    aria-label="Seleccionar turno de destino"
                    className="h-8 rounded border border-input bg-background px-2 text-xs"
                    defaultValue=""
                    onChange={(e) => {
                      if (!e.target.value) return;
                      const [new_day, new_turno] = e.target.value.split("#") as [string, Turno];
                      reschedule.mutate(
                        { assignment_id: r.id, new_day, new_turno },
                        {
                          onSuccess: () => toast.success("Familia reasignada al turno seleccionado"),
                          // The move RPC rejects if the target turno closed concurrently
                          // (CONFLICT) — surface it instead of failing silently.
                          onError: (err) => toast.error(err.message || "Error al reasignar"),
                        },
                      );
                      setReschedulingId(null);
                    }}
                  >
                    <option value="">— Seleccionar turno —</option>
                    {openSlots.map((s) => (
                      <option key={s.id} value={`${s.slot_date}#${s.turno}`}>
                        {formatSlotOpt(s.slot_date, s.turno)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => setReschedulingId(r.id)}
                  >
                    Reasignar a otro turno
                  </Button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.attended ? "Marcar como atendida" : "Marcar como ausente"}
            </AlertDialogTitle>
            <AlertDialogDescription>{pending?.label} — ¿confirmas?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirm} disabled={mark.isPending}>
              {mark.isPending ? "Guardando…" : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
