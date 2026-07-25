/**
 * CancelarSesionDialog.tsx — Dialog to cancel a session with a mandatory motivo.
 * Mirrors the pattern from BajaDialog.tsx (ADR-0013: motivo is always required).
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface CancelarSesionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionFecha: string;
  isLoading?: boolean;
  onConfirm: (motivo: string) => void;
}

export function CancelarSesionDialog({
  open,
  onOpenChange,
  sessionFecha,
  isLoading = false,
  onConfirm,
}: CancelarSesionDialogProps) {
  const [motivo, setMotivo] = useState("");

  function handleConfirm() {
    if (!motivo.trim()) return;
    onConfirm(motivo.trim());
  }

  function handleOpenChange(next: boolean) {
    if (!next) setMotivo("");
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancelar sesión</DialogTitle>
          <DialogDescription>
            Se cancelará la sesión del{" "}
            <strong>{sessionFecha}</strong>. La sesión sale del denominador de
            cumplimiento. El motivo es obligatorio y queda en el historial.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5 py-2">
          <Label htmlFor="cancel-motivo">
            Motivo de cancelación{" "}
            <span className="text-destructive" aria-hidden="true">*</span>
          </Label>
          <Textarea
            id="cancel-motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej: Festivo no previsto, problema de espacio..."
            maxLength={500}
            rows={3}
            aria-required="true"
          />
          <p className="text-xs text-muted-foreground">
            {500 - motivo.length} caracteres restantes
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isLoading}
          >
            No cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={!motivo.trim() || isLoading}
            aria-disabled={!motivo.trim() || isLoading}
          >
            {isLoading ? "Cancelando..." : "Confirmar cancelación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
