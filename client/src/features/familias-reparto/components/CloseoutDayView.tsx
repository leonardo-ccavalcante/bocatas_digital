import { useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { CloseoutScanner } from "./CloseoutScanner";
import { CloseoutRosterList } from "./CloseoutRosterList";
import { AttendSignFlow } from "./AttendSignFlow";
import {
  useSlotRoster,
  useMarkAttendance,
  useUndoAttendance,
  useFirmaEnabled,
} from "../hooks/useReparto";

interface Props {
  roundId: string;
  /** The slot being worked on (provides slot_date/turno/estado from the roster). */
  slotId: string;
}

interface PendingMark {
  assignmentId: string;
  label: string;
  attended: boolean;
  signerPersonId: string | null;
}

/** Close-out for one (day × turno) slot.
 *  All still-pending families of the round appear here (carry-over model),
 *  smallest-first from the server. Families attended in THIS slot appear below. */
export function CloseoutDayView({ roundId, slotId }: Props) {
  const { data: roster, isLoading } = useSlotRoster(roundId, slotId);
  const { data: firma } = useFirmaEnabled();
  const mark = useMarkAttendance();
  const undo = useUndoAttendance();
  const [pendingMark, setPendingMark] = useState<PendingMark | null>(null);

  const slot = roster?.slot;
  const pending = roster?.pending ?? [];
  const attendedHere = roster?.attended_here ?? [];
  const isReadOnly = slot?.estado === "cerrado";

  const signerFor = (assignmentId: string) =>
    pending.find((r) => r.id === assignmentId)?.titular_person_id ?? null;

  const handleMark = (assignmentId: string, label: string, attended: boolean) => {
    setPendingMark({ assignmentId, label, attended, signerPersonId: signerFor(assignmentId) });
  };

  // On-screen signature replaces the plain confirm only when: firma enabled,
  // marking ATTENDED, and we know who signs (a resolvable family member).
  const useSignFlow =
    !!pendingMark && pendingMark.attended && !!firma?.enabled && !!pendingMark.signerPersonId;

  const confirmMark = async () => {
    if (!pendingMark) return;
    try {
      await mark.mutateAsync({
        assignment_id: pendingMark.assignmentId,
        slot_id: slotId,
        attended: pendingMark.attended,
      });
      toast(`${pendingMark.label} — ${pendingMark.attended ? "atendida" : "ausente"}`, {
        action: {
          label: "Deshacer",
          onClick: () => { undo.mutate({ assignment_id: pendingMark.assignmentId }); },
        },
        duration: 30_000,
      });
      setPendingMark(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al marcar asistencia");
      setPendingMark(null);
    }
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Cargando asignaciones…</p>;

  const attended = attendedHere.filter((r) => r.attended === true).length;
  const ausentes = attendedHere.filter((r) => r.attended === false).length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground" role="status">
        {pending.length} pendiente{pending.length !== 1 ? "s" : ""} ·{" "}
        {attended} atendida{attended !== 1 ? "s" : ""} ·{" "}
        {ausentes} ausente{ausentes !== 1 ? "s" : ""}
      </p>

      {isReadOnly ? (
        <p className="rounded-md border border-muted bg-muted/40 p-2 text-sm text-muted-foreground" role="status">
          Turno cerrado — registro de asistencia en solo lectura.
        </p>
      ) : (
        <CloseoutScanner
          roundId={roundId}
          slotId={slotId}
          onResolved={(assignmentId) => {
            const row = pending.find((r) => r.id === assignmentId);
            const label = row
              ? (row.nombre_titular ?? `Expediente #${row.expediente ?? assignmentId.slice(0, 8)}`)
              : "Familia";
            setPendingMark({ assignmentId, label, attended: true, signerPersonId: row?.titular_person_id ?? null });
          }}
        />
      )}

      <CloseoutRosterList
        pending={pending}
        attendedHere={attendedHere}
        isReadOnly={isReadOnly}
        onMark={handleMark}
      />

      <AlertDialog open={!!pendingMark && !useSignFlow} onOpenChange={(o) => !o && setPendingMark(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingMark?.attended ? "Marcar como atendida" : "Marcar como ausente"}
            </AlertDialogTitle>
            <AlertDialogDescription>{pendingMark?.label} — ¿confirmas?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmMark} disabled={mark.isPending}>
              {mark.isPending ? "Guardando…" : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* RGPD-gated on-screen signature: replaces the plain confirm for an
          attended family when firma is enabled and a signer is known. */}
      {pendingMark && useSignFlow && pendingMark.signerPersonId && (
        <AttendSignFlow
          open
          assignmentId={pendingMark.assignmentId}
          slotId={slotId}
          signerPersonId={pendingMark.signerPersonId}
          label={pendingMark.label}
          onClose={() => setPendingMark(null)}
          onDone={() => setPendingMark(null)}
        />
      )}
    </div>
  );
}
