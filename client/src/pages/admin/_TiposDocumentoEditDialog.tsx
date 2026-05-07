import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export type EditState = {
  id: string;
  nombre: string;
  descripcion: string;
  isRequired: boolean;
  displayOrder: number;
};

export function EditDialog({
  state,
  open,
  onClose,
  onSave,
}: {
  state: EditState;
  open: boolean;
  onClose: () => void;
  onSave: (values: EditState) => void;
}) {
  // Keyed by state.id from parent so form initialises fresh on each open
  const [form, setForm] = useState<EditState>(state);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar tipo de documento</DialogTitle>
          <DialogDescription>
            Modifica los campos editables. El slug y el ámbito no son editables.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="edit-nombre">Nombre</Label>
            <Input
              id="edit-nombre"
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="edit-descripcion">Descripción</Label>
            <Input
              id="edit-descripcion"
              value={form.descripcion}
              onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="edit-required"
              checked={form.isRequired}
              onCheckedChange={(val) => setForm((f) => ({ ...f, isRequired: val }))}
            />
            <Label htmlFor="edit-required">Obligatorio</Label>
          </div>
          <div>
            <Label htmlFor="edit-order">Orden de visualización</Label>
            <Input
              id="edit-order"
              type="number"
              value={form.displayOrder}
              onChange={(e) => setForm((f) => ({ ...f, displayOrder: Number(e.target.value) }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} aria-label="Cancelar">
            Cancelar
          </Button>
          <Button onClick={() => onSave(form)} aria-label="Guardar">
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
