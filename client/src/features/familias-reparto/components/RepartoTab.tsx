import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CheckCircle2, Lock } from "lucide-react";
import { toast } from "sonner";
import { useRepartos, useListSlots, useCerrarTurno, useCloseReparto } from "../hooks/useReparto";
import { CrearRepartoForm } from "./CrearRepartoForm";
import { RepartoList } from "./RepartoList";
import { RepartoPreview } from "./RepartoPreview";
import { CloseoutDayView } from "./CloseoutDayView";
import { HojaFirmasPrint } from "./HojaFirmasPrint";
import { ListadoInternoPrint } from "./ListadoInternoPrint";
import { SignedActaUpload } from "./SignedActaUpload";
import { ActaCloseoutReview } from "./ActaCloseoutReview";
import type { Turno } from "../schemas";

interface Props {
  programId: string;
}

const MES_ES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
function slotLabel(date: string, turno: string): string {
  const [, m, d] = date.split("-");
  const t = turno === "manana" ? "Mañana" : "Tarde";
  return `${parseInt(d, 10)} ${MES_ES[parseInt(m, 10) - 1] ?? m} · ${t}`;
}

/** Orchestrates the Reparto flow: list → create → preview → close-out + docs. */
export function RepartoTab({ programId }: Props) {
  const { data: repartos } = useRepartos(programId);
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);

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

  const allSlotsClosed = useMemo(
    () => !!slots?.length && slots.every((s) => s.estado === "cerrado"),
    [slots],
  );

  const handleCloseReparto = async () => {
    if (!selected) return;
    try {
      await closeReparto.mutateAsync({ round_id: selected.id });
      toast.success("Reparto cerrado");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al cerrar el reparto");
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
          <>
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
                      className="h-7 px-2 text-xs"
                      disabled={cerrarTurno.isPending}
                      onClick={() => {
                        cerrarTurno.mutate(
                          { slot_id: s.id },
                          { onError: (err) => toast.error(err.message ?? "Error al cerrar turno") },
                        );
                      }}
                      aria-label={`Cerrar turno ${slotLabel(s.slot_date, s.turno)}`}
                    >
                      <Lock className="h-3 w-3" aria-hidden />
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
                  onClick={handleCloseReparto}
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
              <Tabs defaultValue="closeout">
                <TabsList>
                  <TabsTrigger value="closeout">Cerrar entrega</TabsTrigger>
                  <TabsTrigger value="hoja">Hoja de Firmas</TabsTrigger>
                  <TabsTrigger value="listado">Lista de distribución</TabsTrigger>
                </TabsList>
                <TabsContent value="closeout">
                  <CloseoutDayView
                    roundId={selected.id}
                    day={activeSlot.slot_date}
                    turno={activeTurno}
                  />
                </TabsContent>
                <TabsContent value="hoja" className="space-y-3">
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
                  <HojaFirmasPrint
                    roundId={selected.id}
                    day={activeSlot.slot_date}
                    turno={activeTurno}
                  />
                </TabsContent>
                <TabsContent value="listado">
                  <ListadoInternoPrint
                    roundId={selected.id}
                    day={activeSlot.slot_date}
                    turno={activeTurno}
                  />
                </TabsContent>
              </Tabs>
            )}
          </>
        )}
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
