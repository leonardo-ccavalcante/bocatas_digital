import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { repartoDays } from "../utils/assignReparto";
import { useRepartos } from "../hooks/useReparto";
import { CrearRepartoForm } from "./CrearRepartoForm";
import { RepartoList } from "./RepartoList";
import { RepartoPreview } from "./RepartoPreview";
import { CloseoutDayView } from "./CloseoutDayView";
import { HojaFirmasPrint } from "./HojaFirmasPrint";
import { ListadoInternoPrint } from "./ListadoInternoPrint";
import { SignedActaUpload } from "./SignedActaUpload";
import { ActaCloseoutReview } from "./ActaCloseoutReview";

interface Props {
  programId: string;
}

/** Orchestrates the Reparto flow: list → create → preview → close-out + docs. */
export function RepartoTab({ programId }: Props) {
  const { data: repartos } = useRepartos(programId);
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo(
    () => repartos?.find((r) => r.id === selectedId) ?? null,
    [repartos, selectedId],
  );
  const days = useMemo(
    () => (selected ? repartoDays(selected.fecha_inicio, selected.dias_reparto) : []),
    [selected],
  );
  const [day, setDay] = useState<string>("");
  const activeDay = day || days[0] || "";

  if (creating) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>← Volver</Button>
        <CrearRepartoForm programId={programId} onCreated={(id) => { setCreating(false); setSelectedId(id); }} />
      </div>
    );
  }

  if (selected) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>← Repartos</Button>
          <h3 className="text-sm font-semibold">{selected.nombre}</h3>
        </div>

        {selected.estado === "borrador" ? (
          <RepartoPreview reparto={selected} onCommitted={() => { /* list refetches via invalidate */ }} />
        ) : (
          <>
            {days.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {days.map((d, i) => (
                  <Button key={d} size="sm" variant={d === activeDay ? "default" : "outline"} onClick={() => setDay(d)}>
                    Día {i + 1}
                  </Button>
                ))}
              </div>
            )}
            <Tabs defaultValue="closeout">
              <TabsList>
                <TabsTrigger value="closeout">Cerrar entrega</TabsTrigger>
                <TabsTrigger value="hoja">Hoja de Firmas</TabsTrigger>
                <TabsTrigger value="listado">Listado interno</TabsTrigger>
              </TabsList>
              <TabsContent value="closeout">
                {activeDay && <CloseoutDayView roundId={selected.id} day={activeDay} />}
              </TabsContent>
              <TabsContent value="hoja" className="space-y-3">
                {activeDay && (
                  <>
                    <SignedActaUpload
                      roundId={selected.id}
                      day={activeDay}
                      existingPath={
                        (selected.signed_actas as Record<string, { url: string }> | null)?.[activeDay]?.url ?? null
                      }
                    />
                    {(selected.signed_actas as Record<string, { url: string }> | null)?.[activeDay]?.url && (
                      <ActaCloseoutReview roundId={selected.id} day={activeDay} />
                    )}
                    <HojaFirmasPrint roundId={selected.id} day={activeDay} />
                  </>
                )}
              </TabsContent>
              <TabsContent value="listado">
                {activeDay && <ListadoInternoPrint roundId={selected.id} day={activeDay} />}
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Repartos</h3>
        <Button size="sm" onClick={() => setCreating(true)}>Nuevo reparto</Button>
      </div>
      <RepartoList programId={programId} onSelect={setSelectedId} />
    </div>
  );
}
