/**
 * CrearInstitucionInlineModal — creates a new institution record inline.
 *
 * Opens from InstitucionTypeahead when no match is found.
 * Calls trpc.instituciones.create and returns the created institution
 * to the parent via onCreated so the typeahead can auto-select it.
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export interface InstitucionPickedItem {
  id: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  codigo_postal: string | null;
}

interface CrearInstitucionInlineModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (institucion: InstitucionPickedItem) => void;
  prefillNombre?: string;
}

type TipoValue = "publica" | "ong" | "parroquia" | "privada" | "otro" | "";

export function CrearInstitucionInlineModal({
  open,
  onClose,
  onCreated,
  prefillNombre,
}: CrearInstitucionInlineModalProps) {
  const [nombre, setNombre] = useState(prefillNombre ?? "");
  const [tipo, setTipo] = useState<TipoValue>("");
  const [areas, setAreas] = useState("");
  const [direccion, setDireccion] = useState("");
  const [codigoPostal, setCodigoPostal] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [notas, setNotas] = useState("");

  const create = trpc.instituciones.create.useMutation();

  const onSubmit = async () => {
    if (!nombre.trim()) {
      toast.error("Nombre obligatorio");
      return;
    }
    try {
      const inst = await create.mutateAsync({
        nombre: nombre.trim(),
        tipo: tipo !== "" ? tipo : undefined,
        areas: areas
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean),
        direccion: direccion.trim() || undefined,
        codigo_postal: codigoPostal.trim() || undefined,
        telefono: telefono.trim() || undefined,
        email: email.trim() || undefined,
        notas: notas.trim() || undefined,
      });
      toast.success("Institución creada");
      onCreated({
        id: inst.id,
        nombre: inst.nombre,
        direccion: inst.direccion,
        telefono: inst.telefono,
        email: inst.email,
        codigo_postal: inst.codigo_postal,
      });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al crear institución");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-md" aria-labelledby="crear-institucion-title">
        <DialogHeader>
          <DialogTitle id="crear-institucion-title">Nueva institución</DialogTitle>
          <DialogDescription>
            Crea una institución para derivar. Se añadirá al catálogo y quedará seleccionada.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="inst-nombre">Nombre *</Label>
            <Input
              id="inst-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              aria-required="true"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="inst-tipo">Tipo</Label>
              <Select
                value={tipo}
                onValueChange={(v) => setTipo(v as TipoValue)}
              >
                <SelectTrigger id="inst-tipo" aria-label="Tipo de institución">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="publica">Pública</SelectItem>
                  <SelectItem value="ong">ONG</SelectItem>
                  <SelectItem value="parroquia">Parroquia</SelectItem>
                  <SelectItem value="privada">Privada</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="inst-areas">Áreas (coma)</Label>
              <Input
                id="inst-areas"
                value={areas}
                onChange={(e) => setAreas(e.target.value)}
                placeholder="salud, vivienda"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="inst-direccion">Dirección</Label>
            <Input
              id="inst-direccion"
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="inst-cp">Código postal</Label>
              <Input
                id="inst-cp"
                value={codigoPostal}
                onChange={(e) => setCodigoPostal(e.target.value)}
                maxLength={5}
                inputMode="numeric"
              />
            </div>
            <div>
              <Label htmlFor="inst-tel">Teléfono</Label>
              <Input
                id="inst-tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                type="tel"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="inst-email">Email</Label>
            <Input
              id="inst-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="inst-notas">Notas</Label>
            <Textarea
              id="inst-notas"
              rows={2}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} type="button">
            Cancelar
          </Button>
          <Button
            onClick={onSubmit}
            disabled={create.isPending}
            type="button"
            aria-busy={create.isPending}
          >
            {create.isPending ? "Creando..." : "Crear"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
