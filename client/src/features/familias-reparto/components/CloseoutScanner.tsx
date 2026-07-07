import { useState, lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, QrCode } from "lucide-react";
import { trpc } from "@/lib/trpc";
import type { Turno } from "../schemas";

// ATL-01: camera lib (~49KB gzip) loads only when the scan dialog opens, not
// with the reparto tab.
const QRScanner = lazy(() =>
  import("@/features/checkin/components/QRScanner").then((m) => ({ default: m.QRScanner }))
);

interface Props {
  roundId: string;
  currentDay: string;
  currentTurno: Turno;
  onResolved: (assignmentId: string) => void;
}

const UUID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

/** QR scan path for close-out. Reuses the comedor QRScanner — no new scanner. */
export function CloseoutScanner({ roundId, currentDay, currentTurno, onResolved }: Props) {
  const [open, setOpen] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const handleDecoded = async (value: string) => {
    setOpen(false);
    const match = value.match(UUID_RE);
    if (!match) { setWarning("QR no válido."); return; }
    const result = await utils.families.resolveAssignment.fetch({
      round_id: roundId,
      person_id: match[1],
      current_day: currentDay,
      current_turno: currentTurno,
    });
    switch (result.status) {
      case "ready":
        setWarning(null);
        onResolved(result.assignment_id);
        break;
      case "already_attended":
        setWarning("Esta familia ya estaba marcada como atendida.");
        break;
      case "wrong_slot": {
        const t = result.expected_turno === "manana" ? "Mañana" : "Tarde";
        setWarning(`Familia asignada al ${result.expected_day} · ${t}, no a este turno.`);
        break;
      }
      case "not_in_round":
        setWarning("Familia no asignada a este reparto.");
        break;
      default:
        setWarning("Persona no encontrada en ninguna familia del programa.");
    }
  };

  return (
    <div className="space-y-2">
      {warning && (
        <div
          role="status"
          className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-700"
        >
          {warning}
          <button className="ml-2 text-xs underline" onClick={() => setWarning(null)}>
            Cerrar
          </button>
        </div>
      )}
      <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
        <QrCode className="mr-2 h-4 w-4" aria-hidden />
        Escanear QR
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Escanear QR familiar</DialogTitle></DialogHeader>
          {open && (
            <Suspense
              fallback={
                <div className="flex flex-col items-center gap-3 py-8" role="status">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
                  <p className="text-sm text-muted-foreground">Abriendo cámara...</p>
                </div>
              }
            >
              <QRScanner onDecoded={handleDecoded} onCancel={() => setOpen(false)} />
            </Suspense>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
