import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScanLine } from "lucide-react";
import { toast } from "sonner";
import { useProposeActaCloseout, useBulkMarkAttendance } from "../hooks/useReparto";
import type { CloseoutProposal } from "../utils/actaCloseoutMatch";

interface Props {
  roundId: string;
  day: string;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  low_confidence: { label: "revisar", cls: "border-amber-300 text-amber-700" },
  not_detected: { label: "no detectada", cls: "border-gray-300 text-gray-600" },
  ok: { label: "", cls: "" },
};

/**
 * OCR-assisted close-out — MANDATORY human review. Reads the signed acta photo,
 * proposes which families signed (pre-checked only when OCR is confident), and
 * the operator confirms before any attendance is written. Amounts are not
 * touched (already snapshotted); this only records who received.
 */
export function ActaCloseoutReview({ roundId, day }: Props) {
  const propose = useProposeActaCloseout();
  const bulk = useBulkMarkAttendance();
  const [proposal, setProposal] = useState<CloseoutProposal | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const run = async () => {
    try {
      const res = await propose.mutateAsync({ round_id: roundId, assigned_day: day });
      setProposal(res.proposal as CloseoutProposal);
      setWarnings(res.warnings ?? []);
      setSelected(new Set(res.proposal.attendedAutoIds));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No se pudo leer el acta");
    }
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const confirm = async () => {
    if (selected.size === 0) { toast.error("Selecciona al menos una familia"); return; }
    try {
      await bulk.mutateAsync({ round_id: roundId, assignment_ids: [...selected], attended: true });
      toast.success(`${selected.size} familia(s) marcadas como atendidas`);
      setProposal(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al confirmar asistencia");
    }
  };

  return (
    <div className="space-y-3 print:hidden">
      <Button size="sm" variant="outline" disabled={propose.isPending} onClick={run}>
        <ScanLine className="mr-2 h-4 w-4" aria-hidden />
        {propose.isPending ? "Leyendo acta…" : "Cerrar día desde el acta (revisar)"}
      </Button>

      {proposal && (
        <div className="space-y-2 rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">
            Revisa y confirma. {proposal.needsReviewCount} fila(s) requieren atención.
          </p>
          {warnings.length > 0 && (
            <p className="text-xs text-amber-700">{warnings.join(" · ")}</p>
          )}
          {proposal.unmatchedOcr.length > 0 && (
            <p className="text-xs text-amber-700">
              Expedientes leídos pero no en este día: {proposal.unmatchedOcr.join(", ")}
            </p>
          )}
          <ul className="space-y-1">
            {proposal.rows.map((r) => {
              const badge = STATUS_BADGE[r.status];
              return (
                <li key={r.assignment_id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.has(r.assignment_id)}
                    onChange={() => toggle(r.assignment_id)}
                    aria-label={`Atendida ${r.nombre ?? r.expediente ?? ""}`}
                  />
                  <span className="flex-1">
                    {r.nombre ?? `Exp. ${r.expediente ?? "?"}`}
                  </span>
                  {badge?.label && (
                    <Badge variant="outline" className={`text-xs ${badge.cls}`}>{badge.label}</Badge>
                  )}
                </li>
              );
            })}
          </ul>
          <Button size="sm" className="w-full" disabled={bulk.isPending} onClick={confirm}>
            {bulk.isPending ? "Guardando…" : `Confirmar asistencia (${selected.size})`}
          </Button>
        </div>
      )}
    </div>
  );
}
