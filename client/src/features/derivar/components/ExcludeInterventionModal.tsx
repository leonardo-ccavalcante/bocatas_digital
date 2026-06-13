/**
 * ExcludeInterventionModal — confirmation dialog for excluding an intervention
 * from a hoja de derivaciones.
 *
 * Self-contained: owns the excludeReason state, the excludeIntervention
 * mutation, and the post-exclusion cache invalidation via trpc.useUtils().
 * The parent only supplies the intervencionId (null = closed), hojaId for
 * cache invalidation, and onClose to clear the open-trigger.
 */

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export interface ExcludeInterventionModalProps {
  intervencionId: string | null;
  hojaId: string;
  onClose: () => void;
}

export function ExcludeInterventionModal({
  intervencionId,
  hojaId,
  onClose,
}: ExcludeInterventionModalProps) {
  const trpcCtx = trpc.useUtils();
  const [excludeReason, setExcludeReason] = useState("");

  // Reset reason whenever the modal closes (intervencionId clears to null)
  useEffect(() => {
    if (!intervencionId) {
      setExcludeReason("");
    }
  }, [intervencionId]);

  const excludeIntervencionMutation = trpc.derivar.excludeIntervention.useMutation({
    onSuccess: () => {
      toast.success("Intervención excluida correctamente.");
      void trpcCtx.derivar.getHoja.invalidate({ hojaId });
      onClose();
    },
    onError: (err) => {
      toast.error(err.message ?? "Error al excluir la intervención.");
    },
  });

  const handleExcludeConfirm = () => {
    if (!intervencionId || !excludeReason.trim()) return;
    excludeIntervencionMutation.mutate({
      intervencionId,
      reason: excludeReason.trim(),
    });
  };

  return (
    <Dialog
      open={intervencionId !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent className="max-w-md w-full" aria-label="Excluir intervención">
        <DialogHeader>
          <DialogTitle>Excluir intervención</DialogTitle>
          <DialogDescription>
            Esta acción excluirá la intervención del documento. Se guardará un registro de auditoría.
            Esta acción no se puede deshacer.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-2">
          <Label htmlFor="exclude-reason">Motivo de exclusión *</Label>
          <Textarea
            id="exclude-reason"
            value={excludeReason}
            onChange={(e) => setExcludeReason(e.target.value)}
            placeholder="Indica el motivo por el que se excluye esta intervención..."
            rows={3}
            aria-required="true"
            data-testid="exclude-reason-input"
          />
        </div>

        <DialogFooter className="gap-2 mt-4">
          <Button
            variant="outline"
            type="button"
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            type="button"
            onClick={handleExcludeConfirm}
            disabled={!excludeReason.trim() || excludeIntervencionMutation.isPending}
            data-testid="confirm-exclude-btn"
          >
            {excludeIntervencionMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Excluyendo…</>
            ) : (
              "Confirmar exclusión"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
