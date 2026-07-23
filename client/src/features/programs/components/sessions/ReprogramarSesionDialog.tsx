/**
 * ReprogramarSesionDialog.tsx — Dialog to move a planificada session to a new date/time.
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ReprogramarSesionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentFecha: string;
  currentHoraInicio?: string | null;
  currentHoraFin?: string | null;
  isLoading?: boolean;
  onConfirm: (values: { fecha: string; hora_inicio?: string; hora_fin?: string }) => void;
}

export function ReprogramarSesionDialog({
  open,
  onOpenChange,
  currentFecha,
  currentHoraInicio,
  currentHoraFin,
  isLoading = false,
  onConfirm,
}: ReprogramarSesionDialogProps) {
  const [fecha, setFecha] = useState(currentFecha);
  const [horaInicio, setHoraInicio] = useState(currentHoraInicio ?? "");
  const [horaFin, setHoraFin] = useState(currentHoraFin ?? "");

  function handleConfirm() {
    if (!fecha) return;
    onConfirm({
      fecha,
      hora_inicio: horaInicio || undefined,
      hora_fin: horaFin || undefined,
    });
  }

  function handleOpenChange(next: boolean) {
    if (next) {
      setFecha(currentFecha);
      setHoraInicio(currentHoraInicio ?? "");
      setHoraFin(currentHoraFin ?? "");
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Reprogramar sesión</DialogTitle>
          <DialogDescription>
            Cambia la fecha y horas de esta sesión. Solo sesiones en estado{" "}
            <strong>planificada</strong> pueden reprogramarse.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="reprogram-fecha">
              Nueva fecha <span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <Input
              id="reprogram-fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              aria-required="true"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="reprogram-inicio">Hora inicio</Label>
              <Input
                id="reprogram-inicio"
                type="time"
                value={horaInicio}
                onChange={(e) => setHoraInicio(e.target.value)}
                placeholder="09:00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reprogram-fin">Hora fin</Label>
              <Input
                id="reprogram-fin"
                type="time"
                value={horaFin}
                onChange={(e) => setHoraFin(e.target.value)}
                placeholder="11:00"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!fecha || isLoading}
          >
            {isLoading ? "Guardando..." : "Reprogramar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
