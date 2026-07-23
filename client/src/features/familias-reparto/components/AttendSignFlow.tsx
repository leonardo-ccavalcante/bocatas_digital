import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { SignaturePad } from "@/features/families/components/SignaturePad";
import { useRecordRepartoSignature, useMarkAttendance } from "../hooks/useReparto";

interface Props {
  open: boolean;
  assignmentId: string;
  slotId: string;
  signerPersonId: string;
  label: string;
  onClose: () => void;
  /** Called after attendance is recorded (signed OR omitted). */
  onDone: () => void;
}

/**
 * On-screen signature at pickup (RGPD-gated PR-4). The family signs on the tablet;
 * recordRepartoSignature stamps attendance + the audit row atomically. "Omitir"
 * falls back to a plain attendance mark (the paper Hoja de Firmas still applies).
 */
export function AttendSignFlow({ open, assignmentId, slotId, signerPersonId, label, onClose, onDone }: Props) {
  const sign = useRecordRepartoSignature();
  const mark = useMarkAttendance();
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  const submitSigned = () => {
    if (!dataUrl) return;
    sign.mutate(
      { assignment_id: assignmentId, slot_id: slotId, signer_person_id: signerPersonId, signature_data_url: dataUrl },
      {
        onSuccess: () => { toast.success(`${label} — atendida y firmada`); onDone(); },
        // Atomic: on failure nothing is recorded. Keep the drawn signature for retry.
        onError: (e) => toast.error(e.message ?? "No se pudo registrar la firma. La firma sigue disponible para reintentar."),
      },
    );
  };

  const submitOmit = () => {
    mark.mutate(
      { assignment_id: assignmentId, slot_id: slotId, attended: true },
      {
        onSuccess: () => { toast(`${label} — atendida (firma en papel)`); onDone(); },
        onError: (e) => toast.error(e.message ?? "Error al marcar asistencia"),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Firma de entrega — {label}</DialogTitle>
          <DialogDescription>
            La persona firma en la pantalla para confirmar la recogida. Si prefiere papel,
            usa «Omitir».
          </DialogDescription>
        </DialogHeader>

        <SignaturePad onCapture={setDataUrl} />

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={submitOmit} disabled={mark.isPending || sign.isPending} className="min-h-11">
            Omitir — usará hoja de papel
          </Button>
          <Button onClick={submitSigned} disabled={!dataUrl || sign.isPending} className="min-h-11">
            {sign.isPending ? "Registrando…" : "Firmar y atender"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
