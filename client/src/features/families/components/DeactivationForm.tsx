import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";
import { useDeactivateFamilia } from "../hooks/useFamilias";

const MOTIVOS = [
  { value: "no_recogida_consecutiva", label: "No recogida consecutiva" },
  { value: "voluntaria", label: "Baja voluntaria" },
  { value: "fraude", label: "Fraude detectado" },
  { value: "cambio_circunstancias", label: "Cambio de circunstancias" },
  { value: "otros", label: "Otros" },
] as const;

type Motivo = typeof MOTIVOS[number]["value"];

interface DeactivationFormProps {
  familyId: string;
  familyNumber: number;
  onSuccess?: () => void;
}

export function DeactivationForm({ familyId, familyNumber, onSuccess }: DeactivationFormProps) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState<Motivo | "">("");
  const [fecha, setFecha] = useState(new Date().toISOString().split("T")[0]);
  const [otrosDetalle, setOtrosDetalle] = useState("");

  const deactivate = useDeactivateFamilia();

  const handleSubmit = async () => {
    if (!motivo) {
      toast.error("Selecciona el motivo de baja");
      return;
    }
    if (motivo === "otros" && !otrosDetalle.trim()) {
      toast.error("Especifica el motivo en el campo de detalle");
      return;
    }

    try {
      await deactivate.mutateAsync({
        id: familyId,
        motivo_baja: motivo as Motivo,
        fecha_baja: fecha,
        otros_detalle: motivo === "otros" ? otrosDetalle : undefined,
      });
      toast.success(`Familia #${familyNumber} dada de baja`);
      setOpen(false);
      onSuccess?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al dar de baja";
      toast.error(msg);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <AlertTriangle className="mr-2 h-4 w-4" />
          Dar de baja
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dar de baja — Familia #{familyNumber}</DialogTitle>
          <DialogDescription>
            Esta acción desactivará la familia. Se puede reactivar posteriormente si es necesario.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label>Motivo de baja *</Label>
            <Select value={motivo} onValueChange={(v) => setMotivo(v as Motivo)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona el motivo" />
              </SelectTrigger>
              <SelectContent>
                {MOTIVOS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {motivo === "otros" && (
            <div>
              <Label>Detalle del motivo *</Label>
              <Textarea
                value={otrosDetalle}
                onChange={(e) => setOtrosDetalle(e.target.value)}
                placeholder="Describe el motivo de baja..."
                rows={3}
              />
            </div>
          )}

          <div>
            <Label>Fecha de baja *</Label>
            <Input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={deactivate.isPending}
          >
            {deactivate.isPending ? "Procesando..." : "Confirmar baja"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
