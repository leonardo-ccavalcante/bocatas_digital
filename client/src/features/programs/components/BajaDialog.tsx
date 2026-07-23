/**
 * BajaDialog.tsx — modal for collecting a mandatory motivo before marking an
 * enrollment as 'baja'. Called by EnrolledPersonsTable and EnrollmentPanel.
 *
 * ADR-0013: baja always requires a motivo.
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

interface BajaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personName: string;
  isLoading?: boolean;
  onConfirm: (motivo: string, notas?: string) => void;
}

export function BajaDialog({
  open,
  onOpenChange,
  personName,
  isLoading = false,
  onConfirm,
}: BajaDialogProps) {
  const [motivo, setMotivo] = useState("");
  const [notas, setNotas] = useState("");

  function handleConfirm() {
    if (!motivo.trim()) return;
    onConfirm(motivo.trim(), notas.trim() || undefined);
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      setMotivo("");
      setNotas("");
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dar de baja</DialogTitle>
          <DialogDescription>
            Se registrará la baja de{" "}
            <strong>{personName}</strong>.{" "}
            El motivo es obligatorio y queda en el historial.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="baja-motivo">
              Motivo de baja{" "}
              <span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <Textarea
              id="baja-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: Traslado de domicilio fuera del área..."
              maxLength={500}
              rows={3}
              aria-required="true"
              aria-describedby="baja-motivo-hint"
            />
            <p id="baja-motivo-hint" className="text-xs text-muted-foreground">
              {500 - motivo.length} caracteres restantes
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="baja-notas">Notas adicionales (opcional)</Label>
            <Textarea
              id="baja-notas"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Observaciones internas..."
              maxLength={500}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isLoading}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={!motivo.trim() || isLoading}
            aria-disabled={!motivo.trim() || isLoading}
          >
            {isLoading ? "Guardando..." : "Confirmar baja"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
