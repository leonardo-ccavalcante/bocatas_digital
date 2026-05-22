import { useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import type { Database } from "@/lib/database.types";
import {
  assignReparto,
  computeKgPerFamily,
  repartoDays,
  repartoCapacityCheck,
} from "../utils/assignReparto";
import { solveReparto } from "../utils/solveReparto";
import type { AssignmentRow } from "../schemas";
import { useCommitAssignments, useEligibleFamilies } from "../hooks/useReparto";

type Reparto = Database["public"]["Tables"]["delivery_rounds"]["Row"];

interface Props {
  reparto: Reparto;
  onCommitted: () => void;
}

/** Shows the balanced day split (people per day) before committing. */
export function RepartoPreview({ reparto, onCommitted }: Props) {
  const { data: families, isLoading } = useEligibleFamilies(reparto.program_id);
  const commit = useCommitAssignments();
  const [done, setDone] = useState(false);

  const days = useMemo(
    () => repartoDays(reparto.fecha_inicio, reparto.dias_reparto),
    [reparto.fecha_inicio, reparto.dias_reparto],
  );

  const capacity = useMemo(() => {
    const totalPeople = (families ?? []).reduce((s, f) => s + f.total_miembros, 0);
    return repartoCapacityCheck(totalPeople, reparto.cap_per_day, days.length);
  }, [families, reparto.cap_per_day, days.length]);

  const plan = useMemo(() => {
    if (!families?.length || !days.length) return null;
    const result = assignReparto(
      families.map((f) => ({ id: f.id, total_miembros: f.total_miembros, familia_numero: f.familia_numero, preferred_day: null })),
      days,
      { capPerDay: reparto.cap_per_day },
    );
    const totalPersonas = families.reduce((s, f) => s + f.total_miembros, 0);
    const byId = new Map(families.map((f) => [f.id, f]));
    const assignments = result.assignments.map((a) => {
      const fam = byId.get(a.family_id);
      const miembros = fam?.total_miembros ?? a.total_miembros;
      return {
        family_id: a.family_id,
        assigned_day: a.assigned_day,
        day_slot: a.day_slot,
        expediente: a.expediente,
        total_miembros: miembros,
        kg_alimentos: computeKgPerFamily(reparto.kg_total_alimentos ?? 0, totalPersonas, miembros),
        kg_carne: computeKgPerFamily(reparto.kg_total_carne ?? 0, totalPersonas, miembros),
      };
    });
    return { result, assignments };
  }, [families, days, reparto.cap_per_day, reparto.kg_total_alimentos, reparto.kg_total_carne]);

  const commitRows = async (rows: AssignmentRow[]) => {
    const res = await commit.mutateAsync({ round_id: reparto.id, assignments: rows });
    toast.success(`Reparto activado — ${res.count} familias asignadas`);
    setDone(true);
    onCommitted();
  };

  const handleCommit = async () => {
    if (!plan) return;
    try { await commitRows(plan.assignments); }
    catch (err: unknown) { toast.error(err instanceof Error ? err.message : "Error al activar el reparto"); }
  };

  // Escalation: re-pack with the exact-on-demand solver when LPT can't fit all.
  const handleSolve = async () => {
    if (!families?.length) return;
    const totalPersonas = families.reduce((s, f) => s + f.total_miembros, 0);
    const solved = solveReparto(
      families.map((f) => ({ id: f.id, total_miembros: f.total_miembros, familia_numero: f.familia_numero, preferred_day: null })),
      days.length,
      reparto.cap_per_day,
    );
    if (!solved.feasible) {
      toast.error("Aún no caben todas: añade días o sube el cupo por día.");
      return;
    }
    const rows = solved.assignments.map((a) => ({
      family_id: a.family_id,
      assigned_day: days[a.day_index],
      day_slot: a.day_index + 1,
      expediente: a.expediente,
      total_miembros: a.total_miembros,
      kg_alimentos: computeKgPerFamily(reparto.kg_total_alimentos ?? 0, totalPersonas, a.total_miembros),
      kg_carne: computeKgPerFamily(reparto.kg_total_carne ?? 0, totalPersonas, a.total_miembros),
    }));
    try { await commitRows(rows); }
    catch (err: unknown) { toast.error(err instanceof Error ? err.message : "Error al activar el reparto"); }
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Calculando reparto…</p>;
  if (!families?.length) return <Alert><AlertDescription>No hay familias activas en este programa.</AlertDescription></Alert>;
  if (!plan) return null;

  return (
    <div className="space-y-4">
      {!capacity.feasible ? (
        // Exact arithmetic: it physically cannot fit — no solver helps. Tell the
        // operator precisely how much to add (their real lever).
        <Alert className="border-red-300 bg-red-50">
          <AlertTitle className="text-red-800">No caben con este cupo</AlertTitle>
          <AlertDescription className="text-red-700">
            Faltan <strong>{capacity.shortfall}</strong> personas de cupo
            ({capacity.capacity} plazas para {capacity.shortfall + (capacity.capacity ?? 0)} personas).
            Añade <strong>{capacity.neededDays - days.length}</strong> día(s) más o sube el cupo por día.
          </AlertDescription>
        </Alert>
      ) : plan.result.needsSolver ? (
        // Feasible by arithmetic but the greedy heuristic stranded someone — the
        // exact-on-demand solver can usually pack it.
        <Alert className="border-amber-300 bg-amber-50">
          <AlertTitle className="text-amber-800">Reajuste necesario</AlertTitle>
          <AlertDescription className="text-amber-700">
            {plan.result.unplaced.length} familia(s) no encajaron con el reparto rápido. Recalcula con el solver.
          </AlertDescription>
          <Button size="sm" variant="outline" className="mt-2" onClick={handleSolve} disabled={commit.isPending}>
            Recalcular con solver
          </Button>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {plan.result.dayLoads.map((d) => (
          <Card key={d.day}>
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm font-semibold">Día {d.slot} · {d.day}</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 text-sm">
              {d.families} familias · {d.people} personas
            </CardContent>
          </Card>
        ))}
      </div>

      {done ? (
        <p className="text-sm font-medium text-green-700">Reparto activado.</p>
      ) : (
        <Button className="w-full" onClick={handleCommit} disabled={commit.isPending || reparto.estado === "cerrada"}>
          {commit.isPending ? "Activando…" : "Confirmar y activar reparto"}
        </Button>
      )}
    </div>
  );
}
