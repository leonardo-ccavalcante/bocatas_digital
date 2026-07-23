import { useState, lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Info, Loader2, QrCode, X } from "lucide-react";
import { trpc } from "@/lib/trpc";

// ATL-01: camera lib (~49KB gzip) loads only when the scan dialog opens, not
// with the reparto tab.
const QRScanner = lazy(() =>
  import("@/features/checkin/components/QRScanner").then((m) => ({ default: m.QRScanner }))
);

interface Props {
  roundId: string;
  /** The actual slot the family is attending — passed to resolveAssignment. */
  slotId: string;
  onResolved: (assignmentId: string) => void;
}

const UUID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

/** QR scan path for close-out. Reuses the comedor QRScanner — no new scanner.
 *  Under the carry-over model a family on a different suggested day is still
 *  "ready" (es_dia_sugerido=false) — no wrong_slot rejection. */
export function CloseoutScanner({ roundId, slotId, onResolved }: Props) {
  const [open, setOpen] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [offSuggestedDay, setOffSuggestedDay] = useState(false);
  const utils = trpc.useUtils();

  const handleDecoded = async (value: string) => {
    setOpen(false);
    const match = value.match(UUID_RE);
    if (!match) { setWarning("QR no válido — no contiene un identificador reconocible."); return; }
    const result = await utils.families.resolveAssignment.fetch({
      round_id: roundId,
      person_id: match[1],
      slot_id: slotId,
    });
    switch (result.status) {
      case "ready":
        setWarning(null);
        setOffSuggestedDay(!result.es_dia_sugerido);
        onResolved(result.assignment_id);
        break;
      case "already_attended":
        setWarning("Esta familia ya fue marcada como atendida en este reparto.");
        setOffSuggestedDay(false);
        break;
      case "ausente":
        setWarning("Esta familia está marcada como ausente. Deshaz la ausencia antes de atenderla.");
        setOffSuggestedDay(false);
        break;
      case "not_in_round":
        setWarning("Familia no asignada a este reparto.");
        setOffSuggestedDay(false);
        break;
      default:
        setWarning("Persona no encontrada en ninguna familia del programa.");
        setOffSuggestedDay(false);
    }
  };

  const dismiss = () => { setWarning(null); setOffSuggestedDay(false); };

  return (
    <div className="space-y-2">
      {offSuggestedDay && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-2 text-sm text-blue-800"
        >
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-600" aria-hidden />
          <span className="flex-1">Familia asignada a un turno diferente — puede atenderse aquí igualmente.</span>
          <button
            type="button"
            aria-label="Cerrar"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded"
            onClick={dismiss}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
      {warning && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-700"
        >
          <span className="flex-1">{warning}</span>
          <button
            type="button"
            aria-label="Cerrar"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded"
            onClick={dismiss}
          >
            <X className="h-4 w-4" aria-hidden />
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
