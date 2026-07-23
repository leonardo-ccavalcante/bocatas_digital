import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CheckCircle2, Lock } from "lucide-react";
import { toast } from "sonner";
import { useRepartos, useListSlots, useCerrarTurno, useCloseReparto } from "../hooks/useReparto";
import { CrearRepartoForm } from "./CrearRepartoForm";
import { RepartoList } from "./RepartoList";
import { RepartoPreview } from "./RepartoPreview";
import { CloseoutDayView } from "./CloseoutDayView";
import { RepartoActaPrint } from "./RepartoActaPrint";
import { ContactoPanel } from "./ContactoPanel";
import { SignedActaUpload } from "./SignedActaUpload";
import { ActaCloseoutReview } from "./ActaCloseoutReview";
import { slotLabel } from "../utils/slotLabel";
import type { Turno } from "../schemas";

interface Props {
  programId: string;
}

/** Orchestrates the Reparto flow: list → create → preview → close-out + docs. */
export function RepartoTab({ programId }: Props) {
  const { data: repartos } = useRepartos(programId);
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [closingSlotId, setClosingSlotId] = useState<string | null>(null);
  const [showCerrarRepartoDialog, setShowCerrarRepartoDialog] = useState(false);

  const selected = useMemo(
    () => repartos?.find((r) => r.id === selectedId) ?? null,
    [repartos, selectedId],
  );

  const { data: slots } = useListSlots(selectedId ?? "");
  const cerrarTurno = useCerrarTurno();
  const closeReparto = useCloseReparto();

  const activeSlot = useMemo(() => {
    if (!slots?.length) return null;
    return slots.find((s) => s.id === activeSlotId) ?? slots[0] ?? null;
  }, [slots, activeSlotId]);

  const closingSlot = useMemo(
    () => (slots ?? []).find((s) => s.id === closingSlotId) ?? null,
    [slots, closingSlotId],
  );

  const allSlotsClosed = useMemo(
    () => !!slots?.length && slots.every((s) => s.estado === "cerrado"),
    [slots],
  );

  const handleCerrarTurno = () => {
    if (!closingSlotId) return;
    cerrarTurno.mutate(
      { slot_id: closingSlotId },
      {
        onSuccess: () => {
          toast.success("Turno cerrado — las familias pendientes pasan automáticamente al siguiente turno abierto");
          setClosingSlotId(null);
        },
        onError: (err) => {
          toast.error(err.message ?? "Error al cerrar turno");
          setClosingSlotId(null);
        },
      },
    );
  };

  const handleCloseReparto = async () => {
    if (!selected) return;
    try {
      const res = await closeReparto.mutateAsync({ round_id: selected.id });
      toast.success(`Reparto cerrado — ${res.ausentes} familia${res.ausentes !== 1 ? "s" : ""} marcada${res.ausentes !== 1 ? "s" : ""} como ausente${res.ausentes !== 1 ? "s" : ""}`);
      setShowCerrarRepartoDialog(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al cerrar el reparto");
      setShowCerrarRepartoDialog(false);
    }
  };

  if (creating) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>← Volver</Button>
        <CrearRepartoForm
          programId={programId}
          onCreated={(id) => { setCreating(false); setSelectedId(id); }}
        />
      </div>
    );
  }

  if (selected) {
    const activeTurno = (activeSlot?.turno ?? "manana") as Turno;
    const existingActaPath =
      (activeSlot?.signed_acta as { url?: string } | null)?.url ?? null;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => { setSelectedId(null); setActiveSlotId(null); }}>
            ← Lista de distribución
          </Button>
          <h3 className="text-sm font-semibold truncate flex-1 text-right">{selected.nombre}</h3>
        </div>

        {selected.estado === "borrador" ? (
          <RepartoPreview reparto={selected} onCommitted={() => { /* list refetches via invalidate */ }} />
        ) : (
          <Tabs defaultValue="cierre">
            <TabsList>
              <TabsTrigger value="cierre">Cierre por día</TabsTrigger>
              <TabsTrigger value="contacto">Contacto</TabsTrigger>
              <TabsTrigger value="docs">Documentos del reparto</TabsTrigger>
            </TabsList>

            <TabsContent value="cierre" className="space-y-4">
              {/* Slot selector: one button per (day × turno) */}
              <div className="flex flex-wrap gap-2 items-center">
                {(slots ?? []).map((s) => (
                  <div key={s.id} className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant={s.id === activeSlot?.id ? "default" : "outline"}
                      className="text-xs"
                      onClick={() => setActiveSlotId(s.id)}
                      aria-pressed={s.id === activeSlot?.id}
                    >
                      {slotLabel(s.slot_date, s.turno)}
                      {s.estado === "cerrado" && (
                        <CheckCircle2 className="ml-1.5 h-3.5 w-3.5 text-green-500" aria-label="cerrado" />
                      )}
                    </Button>
                    {s.estado === "abierto" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-11 min-w-11 px-2 text-xs"
                        disabled={cerrarTurno.isPending}
                        onClick={() => setClosingSlotId(s.id)}
                        aria-label={`Cerrar turno ${slotLabel(s.slot_date, s.turno)}`}
                      >
                        <Lock className="h-4 w-4" aria-hidden />
                      </Button>
                    )}
                  </div>
                ))}
                {selected.estado === "activa" && (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="ml-auto"
                    disabled={!allSlotsClosed || closeReparto.isPending}
                    onClick={() => setShowCerrarRepartoDialog(true)}
                    title={allSlotsClosed ? undefined : "Cierra todos los turnos primero"}
                  >
                    {closeReparto.isPending ? "Cerrando…" : "Cerrar reparto"}
                  </Button>
                )}
                {selected.estado === "cerrada" && (
                  <Badge variant="outline" className="ml-auto text-xs">Reparto cerrado</Badge>
                )}
              </div>

              {activeSlot && (
                <div className="space-y-3">
                  <CloseoutDayView roundId={selected.id} slotId={activeSlot.id} />
                  <SignedActaUpload
                    roundId={selected.id}
                    slotId={activeSlot.id}
                    day={activeSlot.slot_date}
                    turno={activeTurno}
                    existingPath={existingActaPath}
                  />
                  {existingActaPath && (
                    <ActaCloseoutReview roundId={selected.id} slotId={activeSlot.id} />
                  )}
                </div>
              )}
            </TabsContent>

            {/* Contact phase: record each family's agreed days (fecha 1 / fecha 2)
                or an early renuncia, before printing the acta de citación. */}
            <TabsContent value="contacto">
              <ContactoPanel roundId={selected.id} />
            </TabsContent>

            {/* Round-level documents — the COMPLETE list of every family, in
                numeric order. Citación (antes: fecha 1 + fecha 2) and Final
                (después: fecha real). No longer per-day. */}
            <TabsContent value="docs">
              <Tabs defaultValue="citacion">
                <TabsList>
                  <TabsTrigger value="citacion">Acta de Citación (antes)</TabsTrigger>
                  <TabsTrigger value="final">Acta Final (después)</TabsTrigger>
                </TabsList>
                <TabsContent value="citacion">
                  <RepartoActaPrint roundId={selected.id} variant="citacion" />
                </TabsContent>
                <TabsContent value="final">
                  <RepartoActaPrint roundId={selected.id} variant="final" />
                </TabsContent>
              </Tabs>
            </TabsContent>
          </Tabs>
        )}

        {/* Cerrar día dialog: explains carry-over, no families marked no-show */}
        <AlertDialog open={!!closingSlotId} onOpenChange={(o) => !o && setClosingSlotId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Cerrar este turno?</AlertDialogTitle>
              <AlertDialogDescription>
                Se cierra el turno del {closingSlot ? slotLabel(closingSlot.slot_date, closingSlot.turno) : "—"}.
                Las familias pendientes pasan automáticamente a los próximos turnos abiertos.
                Nadie se marca como ausente ahora.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleCerrarTurno} disabled={cerrarTurno.isPending}>
                {cerrarTurno.isPending ? "Cerrando…" : "Cerrar turno"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Cerrar reparto dialog: warns about ausentes */}
        <AlertDialog open={showCerrarRepartoDialog} onOpenChange={setShowCerrarRepartoDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Cerrar el reparto?</AlertDialogTitle>
              <AlertDialogDescription>
                Las familias que aún no han recogido su pedido se marcarán como ausentes.
                Esta acción no se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => void handleCloseReparto()}
                disabled={closeReparto.isPending}
              >
                {closeReparto.isPending ? "Cerrando…" : "Cerrar reparto"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  const hasRepartos = repartos && repartos.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-h3">Lista de distribución</h3>
        <Button size="sm" onClick={() => setCreating(true)}>Generar lista</Button>
      </div>
      {!hasRepartos && (
        <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 p-6 text-center space-y-3">
          <p className="text-body font-medium text-foreground">No hay listas generadas</p>
          <p className="text-body-sm text-muted-foreground">
            Genera la lista de distribución para organizar qué familias reciben alimentos cada día del reparto.
            Incluye la Hoja de Firmas y el listado de asistencia.
          </p>
          <Button onClick={() => setCreating(true)} className="mt-2">
            Generar lista de distribución
          </Button>
        </div>
      )}
      {hasRepartos && <RepartoList programId={programId} onSelect={setSelectedId} />}
    </div>
  );
}
