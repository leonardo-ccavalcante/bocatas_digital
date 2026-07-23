import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Info } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/lib/database.types";
import { usePreviewAssignments, useActivateReparto } from "../hooks/useReparto";

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

/**
 * Server-authoritative preview of the suggested distribution for a borrador reparto.
 * Calls previewAssignments (server runs the engine deterministically) and lets the
 * operator confirm with activateRound. No client-side engine runs here.
 */
export function RepartoPreview({ reparto, onCommitted }: Props) {
  const { data: preview, isLoading } = usePreviewAssignments(reparto.id);
  const activate = useActivateReparto();
  const [done, setDone] = useState(false);

  const handleActivate = async () => {
    try {
      const res = await activate.mutateAsync({ round_id: reparto.id });
      toast.success(`Reparto activado — ${res.count} familias asignadas`);
      setDone(true);
      onCommitted();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al activar el reparto");
    }
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Calculando reparto…</p>;
  }
  if (!preview) return null;

  const { slotLoads, overCap, totals } = preview;

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 flex items-start gap-2">
        <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-600" aria-hidden />
        <span>
          <strong>{totals.familias}</strong> familia{totals.familias !== 1 ? "s" : ""} activas ·{" "}
          <strong>{totals.personas}</strong> persona{totals.personas !== 1 ? "s" : ""}
        </span>
      </div>

      {overCap.length > 0 && (
        <Alert className="border-amber-300 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-700" aria-hidden />
          <AlertTitle className="text-amber-800">Cupo de referencia superado</AlertTitle>
          <AlertDescription className="text-amber-700">
            {overCap.map((oc) => (
              <span key={`${oc.date}#${oc.turno}`} className="block">
                {formatSlotLabel(oc.date, oc.turno)}: {oc.people} personas (cupo {oc.cap})
              </span>
            ))}
            El cupo es de referencia — nadie queda sin asignar.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {slotLoads.map((sl) => (
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
          onClick={handleActivate}
          disabled={activate.isPending || reparto.estado === "cerrada"}
        >
          {activate.isPending ? "Activando…" : "Confirmar y activar reparto"}
        </Button>
      )}
    </div>
  );
}
