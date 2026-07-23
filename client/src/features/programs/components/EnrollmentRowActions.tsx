/**
 * EnrollmentRowActions.tsx — per-row actions for EnrolledPersonsTable.
 * Renders: estado-change select + "Admitir" quick action + BajaDialog trigger.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ESTADO_LABELS, ESTADOS_INSCRIPCION } from "@shared/programEstados";
import { BajaDialog } from "./BajaDialog";
import { useUnenrollPerson, useUpdateEnrollmentEstado } from "../hooks/useEnrollment";
import type { EstadoInscripcion } from "@shared/programEstados";

interface EnrollmentRowActionsProps {
  enrollmentId: string;
  personName: string;
  currentEstado: string;
  /** Program's enabled estado set; falls back to ESTADOS_INSCRIPCION. */
  estadosHabilitados: string[];
  programId: string;
}

export function EnrollmentRowActions({
  enrollmentId,
  personName,
  currentEstado,
  estadosHabilitados,
  programId,
}: EnrollmentRowActionsProps) {
  const [bajaOpen, setBajaOpen] = useState(false);
  const [pendingEstado, setPendingEstado] = useState<EstadoInscripcion | null>(null);

  const unenroll = useUnenrollPerson(programId);
  const updateEstado = useUpdateEnrollmentEstado(programId);

  // Target estados available for this program (plus baja is always reachable)
  const targetEstados = (
    estadosHabilitados.length > 0 ? estadosHabilitados : [...ESTADOS_INSCRIPCION]
  ).filter((e) => (ESTADOS_INSCRIPCION as readonly string[]).includes(e)) as EstadoInscripcion[];

  const otherEstados = targetEstados.filter((e) => e !== currentEstado && e !== "baja");

  function handleEstadoChange(next: string) {
    if (next === "baja") {
      setPendingEstado("baja");
      setBajaOpen(true);
      return;
    }
    updateEstado.mutate({
      enrollmentId,
      estado: next as EstadoInscripcion,
    });
  }

  function handleAdmitir() {
    updateEstado.mutate({ enrollmentId, estado: "admitido" });
  }

  function handleBajaConfirm(motivo: string, notas?: string) {
    if (pendingEstado === "baja") {
      unenroll.mutate({ enrollmentId, motivo, notas });
    }
    setBajaOpen(false);
    setPendingEstado(null);
  }

  const isBusy = unenroll.isPending || updateEstado.isPending;

  return (
    <div className="flex items-center gap-1 justify-end flex-wrap">
      {/* One-click promote from lista_espera */}
      {currentEstado === "lista_espera" && (
        <Button
          variant="outline"
          size="sm"
          className="text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50"
          onClick={handleAdmitir}
          disabled={isBusy}
          aria-label={`Admitir a ${personName}`}
        >
          Admitir
        </Button>
      )}

      {/* Estado change select (exclude current and baja handled separately) */}
      {otherEstados.length > 0 && (
        <Select onValueChange={handleEstadoChange} disabled={isBusy}>
          <SelectTrigger
            className="h-7 w-auto text-xs px-2"
            aria-label="Cambiar estado de inscripción"
          >
            <SelectValue placeholder="Cambiar estado" />
          </SelectTrigger>
          <SelectContent>
            {otherEstados.map((e) => (
              <SelectItem key={e} value={e} className="text-xs">
                {ESTADO_LABELS[e]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Dar de baja — always available for non-baja enrollments */}
      {currentEstado !== "baja" && currentEstado !== "terminado" && currentEstado !== "completado" && (
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground hover:text-destructive"
          onClick={() => { setPendingEstado("baja"); setBajaOpen(true); }}
          disabled={isBusy}
          aria-label={`Dar de baja a ${personName}`}
        >
          Dar de baja
        </Button>
      )}

      <BajaDialog
        open={bajaOpen}
        onOpenChange={setBajaOpen}
        personName={personName}
        isLoading={unenroll.isPending}
        onConfirm={handleBajaConfirm}
      />
    </div>
  );
}
