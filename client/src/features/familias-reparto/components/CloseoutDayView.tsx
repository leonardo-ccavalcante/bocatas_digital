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
import { useAssignmentsForDay, useMarkAttendance, useUndoAttendance, useReassignPending } from "../hooks/useReparto";

interface Props {
  roundId: string;
  day: string;
}

interface Pending {
  assignmentId: string;
  label: string;
  attended: boolean;
}

/** Close-out for one delivery day: mark attended/no-show with confirm + 30s undo. */
export function CloseoutDayView({ roundId, day }: Props) {
  const { data: rows, isLoading } = useAssignmentsForDay(roundId, day);
  const mark = useMarkAttendance();
  const undo = useUndoAttendance();
  const reassign = useReassignPending();
  const [pending, setPending] = useState<Pending | null>(null);

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
        {(pendientes > 0 || ausentes > 0) && (
          <Button
            size="sm"
            variant="outline"
            disabled={reassign.isPending}
            onClick={async () => {
              const res = await reassign.mutateAsync({ round_id: roundId, from_day: day });
              toast.success(`${res.moved} familia(s) reprogramada(s) a días siguientes`);
            }}
          >
            Reprogramar pendientes
          </Button>
        )}
      </div>

      <CloseoutScanner roundId={roundId} currentDay={day} onResolved={onScanResolved} />

      <ul className="space-y-2">
        {list.map((r) => (
          <li
            key={r.id}
            className={`flex items-center justify-between rounded-lg border p-3 ${
              r.attended === true ? "border-green-200 bg-green-50"
                : r.attended === false ? "border-red-200 bg-red-50" : ""
            }`}
          >
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
          </li>
        ))}
      </ul>

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.attended ? "Marcar como atendida" : "Marcar como ausente"}</AlertDialogTitle>
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
