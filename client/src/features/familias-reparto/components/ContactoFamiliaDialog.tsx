import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from "sonner";
import { useSetContactoFamilia } from "../hooks/useReparto";
import { slotLabel } from "../utils/slotLabel";

export interface ContactoAssignment {
  assignment_id: string;
  familia_numero: number | null;
  nombre: string | null;
  estado_contacto: string | null;
  preferred_slot_ids: string[];
}

interface Slot {
  id: string;
  slot_date: string;
  turno: string;
}

interface Props {
  assignment: ContactoAssignment | null;
  slots: Slot[];
  onClose: () => void;
}

type Outcome = "confirmada" | "no_contesta" | "renuncia";

/**
 * Admin contact outcome for one family in the round. Records up to 2 preferred
 * days (which become fecha 1 / fecha 2 on the citación), or an early renuncia.
 * The suggested day is automatic; contact only refines it. Admin-only.
 */
export function ContactoFamiliaDialog({ assignment, slots, onClose }: Props) {
  const setContacto = useSetContactoFamilia();
  const [outcome, setOutcome] = useState<Outcome>("confirmada");
  const [selected, setSelected] = useState<string[]>([]);

  // Re-seed the form each time a different family's dialog opens.
  useEffect(() => {
    if (!assignment) return;
    const ec = assignment.estado_contacto;
    setOutcome(ec === "renuncia" ? "renuncia" : ec === "no_contesta" ? "no_contesta" : "confirmada");
    setSelected(assignment.preferred_slot_ids.slice(0, 2));
  }, [assignment]);

  const open = assignment !== null;

  const submit = () => {
    if (!assignment) return;
    setContacto.mutate(
      {
        assignment_id: assignment.assignment_id,
        estado_contacto: outcome,
        ...(outcome === "renuncia"
          ? { renuncia: true }
          : { preferred_slot_ids: outcome === "confirmada" ? selected : [] }),
      },
      {
        onSuccess: () => {
          toast.success("Contacto registrado");
          onClose();
        },
        onError: (e) => toast.error(e.message ?? "No se pudo registrar el contacto"),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Contacto · Familia {assignment?.familia_numero ?? "—"}
          </DialogTitle>
          <DialogDescription>
            {assignment?.nombre ?? "Sin titular"} — registra el resultado del contacto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <RadioGroup value={outcome} onValueChange={(v) => setOutcome(v as Outcome)}>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="confirmada" id="c-conf" />
              <Label htmlFor="c-conf">Puede venir — elegir día(s)</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="no_contesta" id="c-nc" />
              <Label htmlFor="c-nc">No contesta (sigue en el día sugerido)</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="renuncia" id="c-ren" />
              <Label htmlFor="c-ren">Renuncia a este reparto</Label>
            </div>
          </RadioGroup>

          {outcome === "confirmada" && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Días que puede venir (máx. 2). Serán la fecha 1 y fecha 2 de la citación.
              </p>
              <ToggleGroup
                type="multiple"
                value={selected}
                onValueChange={(v) => setSelected(v.slice(-2))}
                className="grid grid-cols-2 gap-2"
              >
                {slots.map((s) => (
                  <ToggleGroupItem
                    key={s.id}
                    value={s.id}
                    variant="outline"
                    className="w-full min-h-11 justify-center whitespace-nowrap px-2 text-sm data-[state=on]:border-primary data-[state=on]:bg-primary/10"
                    disabled={selected.length >= 2 && !selected.includes(s.id)}
                  >
                    {slotLabel(s.slot_date, s.turno)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          )}

          {outcome === "renuncia" && (
            <p className="text-sm text-amber-600" role="alert">
              La familia quedará marcada como ausente de todo el reparto. Puede revertirse
              volviendo a registrar el contacto.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={setContacto.isPending}>
            {setContacto.isPending ? "Guardando…" : "Guardar contacto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
