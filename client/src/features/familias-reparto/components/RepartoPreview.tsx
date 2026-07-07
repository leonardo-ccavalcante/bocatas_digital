import { useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import type { Database } from "@/lib/database.types";
import {
  assignReparto,
  computeKgPerFamily,
  repartoCapacityCheck,
} from "../utils/assignReparto";
import type { AssignmentRow } from "../schemas";
import { useCommitAssignments, useEligibleFamilies, useListSlots } from "../hooks/useReparto";

type Reparto = Database["public"]["Tables"]["delivery_rounds"]["Row"];

interface Props {
  reparto: Reparto;
  onCommitted: () => void;
}

const MES_ES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
function formatSlotLabel(date: string, turno: string): string {
  const [, m, d] = date.split("-");
  const mes = MES_ES[parseInt(m, 10) - 1] ?? m;
  const t = turno === "manana" ? "Mañana" : "Tarde";
  return `${parseInt(d, 10)} ${mes} · ${t}`;
}

/** Shows per-slot people load before committing the round. */
export function RepartoPreview({ reparto, onCommitted }: Props) {
  const { data: families, isLoading: familiesLoading } = useEligibleFamilies(reparto.program_id);
  const { data: slotsRaw, isLoading: slotsLoading } = useListSlots(reparto.id);
  const commit = useCommitAssignments();
  const [done, setDone] = useState(false);

  const slots = useMemo(
    () =>
      (slotsRaw ?? []).map((s) => ({
        date: s.slot_date,
        turno: s.turno as "manana" | "tarde",
        ordinal: s.ordinal,
        cap: s.cap ?? null,
        esFueraMadrid: s.es_fuera_madrid ?? false,
      })),
    [slotsRaw],
  );

  // Hybrid: when a slot is reserved for fuera-de-Madrid, show how many families
  // the postal-code derivation actually detected (0 while codigo_postal is empty).
  const fueraInfo = useMemo(() => {
    if (!slots.some((s) => s.esFueraMadrid)) return null;
    const detected = (families ?? []).filter((f) => f.es_fuera_madrid);
    return { families: detected.length, people: detected.reduce((s, f) => s + f.total_miembros, 0) };
  }, [slots, families]);

  const capacity = useMemo(() => {
    const totalPeople = (families ?? []).reduce((s, f) => s + f.total_miembros, 0);
    return repartoCapacityCheck(totalPeople, slots);
  }, [families, slots]);

  const plan = useMemo(() => {
    if (!families?.length || !slots.length) return null;
    const totalPersonas = families.reduce((s, f) => s + f.total_miembros, 0);
    const result = assignReparto(
      families.map((f) => ({
        id: f.id,
        total_miembros: f.total_miembros,
        familia_numero: f.familia_numero,
        preferred_day: null,
        esFueraMadrid: f.es_fuera_madrid,
      })),
      slots,
    );
    const byId = new Map(families.map((f) => [f.id, f]));
    const assignments: AssignmentRow[] = result.assignments.map((a) => {
      const miembros = byId.get(a.family_id)?.total_miembros ?? a.total_miembros;
      return {
        family_id: a.family_id,
        assigned_day: a.assigned_day,
        turno: a.turno,
        day_slot: a.day_slot,
        expediente: a.expediente,
        total_miembros: miembros,
        kg_alimentos: computeKgPerFamily(reparto.kg_total_alimentos ?? 0, totalPersonas, miembros),
        kg_carne: computeKgPerFamily(reparto.kg_total_carne ?? 0, totalPersonas, miembros),
      };
    });
    return { result, assignments };
  }, [families, slots, reparto.kg_total_alimentos, reparto.kg_total_carne]);

  const handleCommit = async () => {
    if (!plan) return;
    try {
      const res = await commit.mutateAsync({ round_id: reparto.id, assignments: plan.assignments });
      toast.success(`Reparto activado — ${res.count} familias asignadas`);
      setDone(true);
      onCommitted();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al activar el reparto");
    }
  };

  if (familiesLoading || slotsLoading) {
    return <p className="text-sm text-muted-foreground">Calculando reparto…</p>;
  }
  if (!families?.length) {
    return <Alert><AlertDescription>No hay familias activas en este programa.</AlertDescription></Alert>;
  }
  if (!slots.length) {
    return <Alert><AlertDescription>No hay turnos configurados para este reparto.</AlertDescription></Alert>;
  }
  if (!plan) return null;

  return (
    <div className="space-y-4">
      {!capacity.feasible && (
        <Alert className="border-red-300 bg-red-50">
          <AlertTitle className="text-red-800">No caben con este cupo</AlertTitle>
          <AlertDescription className="text-red-700">
            Faltan <strong>{capacity.shortfall}</strong> personas.
            Sube el cupo o añade un turno.
          </AlertDescription>
        </Alert>
      )}
      {capacity.feasible && plan.result.needsMoreCapacity && (
        <Alert className="border-amber-300 bg-amber-50">
          <AlertTitle className="text-amber-800">Cupo insuficiente</AlertTitle>
          <AlertDescription className="text-amber-700">
            {plan.result.unplaced.length} familia(s) no encajaron — sube el cupo o añade un turno.
          </AlertDescription>
        </Alert>
      )}
      {fueraInfo && (
        <Alert className={fueraInfo.families > 0 ? "border-blue-300 bg-blue-50" : "border-amber-300 bg-amber-50"}>
          <AlertTitle className={fueraInfo.families > 0 ? "text-blue-800" : "text-amber-800"}>
            Turno reservado · Fuera de Madrid
          </AlertTitle>
          <AlertDescription className={fueraInfo.families > 0 ? "text-blue-700" : "text-amber-700"}>
            {fueraInfo.families > 0
              ? `${fueraInfo.families} familia(s) · ${fueraInfo.people} personas de fuera de Madrid detectadas por código postal — tienen prioridad en el turno reservado.`
              : "0 familias detectadas por código postal (aún sin cargar). El turno reservado se reparte como uno normal hasta que haya CP; asigna manualmente si hace falta."}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {plan.result.slotLoads.map((sl) => (
          <Card key={`${sl.date}#${sl.turno}`}>
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm font-semibold">
                {formatSlotLabel(sl.date, sl.turno)}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 text-sm">
              {sl.families} familias · {sl.people} personas
            </CardContent>
          </Card>
        ))}
      </div>

      {done ? (
        <p className="text-sm font-medium text-green-700">Reparto activado.</p>
      ) : (
        <Button
          className="w-full"
          onClick={handleCommit}
          disabled={commit.isPending || reparto.estado === "cerrada" || plan.result.needsMoreCapacity}
        >
          {commit.isPending ? "Activando…" : "Confirmar y activar reparto"}
        </Button>
      )}
    </div>
  );
}
