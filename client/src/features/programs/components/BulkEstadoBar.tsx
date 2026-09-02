/**
 * BulkEstadoBar.tsx — barra que aparece al marcar filas en la tabla de
 * inscritos: «Cambiar estado (N)» + confirmación.
 *
 * Sólo ofrece los estados que el programa tiene habilitados; el servidor
 * vuelve a validarlo fila a fila. `baja` exige motivo aquí y allí.
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ESTADO_LABELS, ESTADOS_INSCRIPCION } from "@shared/programEstados";
import type { EstadoInscripcion } from "@shared/programEstados";
import { useUpdateEnrollmentEstado } from "../hooks/useEnrollment";

interface BulkEstadoBarProps {
  programId: string;
  /** Ids marcados y todavía visibles en la página (ver enrollmentSeleccion). */
  seleccionados: string[];
  estadosHabilitados: string[];
  onHecho: () => void;
}

export function BulkEstadoBar({
  programId,
  seleccionados,
  estadosHabilitados,
  onHecho,
}: BulkEstadoBarProps) {
  const [open, setOpen] = useState(false);
  const [estado, setEstado] = useState<EstadoInscripcion | "">("");
  const [motivo, setMotivo] = useState("");
  const updateEstado = useUpdateEnrollmentEstado(programId);

  const destinos = (
    estadosHabilitados.length > 0 ? estadosHabilitados : [...ESTADOS_INSCRIPCION]
  ).filter((e) =>
    (ESTADOS_INSCRIPCION as readonly string[]).includes(e)
  ) as EstadoInscripcion[];

  const faltaMotivo = estado === "baja" && motivo.trim().length === 0;

  function cambiarApertura(next: boolean) {
    if (!next) {
      setEstado("");
      setMotivo("");
    }
    setOpen(next);
  }

  function confirmar() {
    if (!estado || faltaMotivo) return;
    updateEstado.mutate(
      {
        enrollmentIds: seleccionados,
        estado,
        motivo: motivo.trim() || undefined,
      },
      {
        onSettled: () => {
          cambiarApertura(false);
          onHecho();
        },
      }
    );
  }

  if (seleccionados.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 px-3 py-2">
      <span className="text-sm font-medium" aria-live="polite">
        {seleccionados.length} seleccionada{seleccionados.length === 1 ? "" : "s"}
      </span>
      <Button size="sm" className="text-xs h-8" onClick={() => setOpen(true)}>
        Cambiar estado ({seleccionados.length})
      </Button>
      <Button variant="ghost" size="sm" className="text-xs h-8" onClick={onHecho}>
        Quitar selección
      </Button>

      <Dialog open={open} onOpenChange={cambiarApertura}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cambiar estado en bloque</DialogTitle>
            <DialogDescription>
              Se aplicará a {seleccionados.length} inscripción
              {seleccionados.length === 1 ? "" : "es"}. Cada cambio queda en el
              historial. Si alguna no se puede cambiar, se avisa y las demás
              se aplican igual.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="bulk-estado">Nuevo estado</Label>
              <Select
                value={estado}
                onValueChange={(v) => setEstado(v as EstadoInscripcion)}
              >
                <SelectTrigger id="bulk-estado" className="text-sm">
                  <SelectValue placeholder="Elegir estado" />
                </SelectTrigger>
                <SelectContent>
                  {destinos.map((e) => (
                    <SelectItem key={e} value={e} className="text-sm">
                      {ESTADO_LABELS[e]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {estado === "baja" && (
              <div className="space-y-1.5">
                <Label htmlFor="bulk-motivo">
                  Motivo de baja{" "}
                  <span className="text-destructive" aria-hidden="true">*</span>
                </Label>
                <Textarea
                  id="bulk-motivo"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ej: fin de la edición..."
                  maxLength={500}
                  rows={3}
                  aria-required="true"
                />
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => cambiarApertura(false)}
              disabled={updateEstado.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={confirmar}
              disabled={!estado || faltaMotivo || updateEstado.isPending}
              aria-disabled={!estado || faltaMotivo || updateEstado.isPending}
            >
              {updateEstado.isPending ? "Aplicando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
