/**
 * CalendarioSesiones.tsx — Tela 1: Calendar tab for an edicion program.
 *
 * Lists sessions from listSesiones grouped by month.
 * Admin: "Generar calendario" button + per-session actions (abrir/cancelar/reprogramar).
 * Cancelled rows appear greyed with a strikethrough and the motivo shown.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { SesionCalendarRow, type SessionListItem } from "./SesionCalendarRow";
import { useListSesiones, useGenerarSesionesMutation } from "../../hooks/useSesiones";
import {
  useAbrirSesion,
  useCancelarSesion,
  useReprogramarSesion,
} from "../../hooks/useSesionMutations";

interface CalendarioSesioneProps {
  programId: string;
  isAdmin: boolean;
  onSelectSession: (session: SessionListItem) => void;
}

function groupByMonth(sessions: SessionListItem[]): Map<string, SessionListItem[]> {
  const map = new Map<string, SessionListItem[]>();
  for (const s of sessions) {
    const key = s.fecha.slice(0, 7); // "YYYY-MM"
    const existing = map.get(key) ?? [];
    existing.push(s);
    map.set(key, existing);
  }
  return map;
}

const MONTH_LABELS: Record<string, string> = {
  "01": "Enero", "02": "Febrero", "03": "Marzo", "04": "Abril",
  "05": "Mayo", "06": "Junio", "07": "Julio", "08": "Agosto",
  "09": "Septiembre", "10": "Octubre", "11": "Noviembre", "12": "Diciembre",
};

function formatMonthKey(key: string): string {
  const [year, month] = key.split("-");
  return `${MONTH_LABELS[month] ?? month} ${year}`;
}

export function CalendarioSesiones({ programId, isAdmin, onSelectSession }: CalendarioSesioneProps) {
  const [currentYear] = useState(() => new Date().getFullYear());
  const { data: sessions = [], isLoading } = useListSesiones(programId);
  const generar = useGenerarSesionesMutation(programId);

  // Lightweight glance stat — shows Planes N/M in the header for quick context.
  // Full compliance dashboard lives in /dashboard when this edition is selected.
  const { data: glance } = trpc.programs.compliance.getComplianceEdicion.useQuery(
    { programId },
    { enabled: !!programId && isAdmin, staleTime: 60_000 }
  );
  const abrir = useAbrirSesion(programId);
  const cancelar = useCancelarSesion(programId);
  const reprogramar = useReprogramarSesion(programId);

  const grouped = groupByMonth(sessions);
  const sortedMonthKeys = Array.from(grouped.keys()).sort();

  if (isLoading) {
    return (
      <div className="space-y-3 py-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header + generate button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <h3 className="text-h3 text-foreground">
            Sesiones {currentYear}
            <span className="ml-2 text-xs text-muted-foreground font-mono">
              ({sessions.length})
            </span>
          </h3>
          {isAdmin && glance && glance.totalSesiones > 0 && (
            <span
              className="ml-3 text-xs text-muted-foreground font-mono bg-muted/50 rounded px-1.5 py-0.5"
              title="Planes de clase subidos"
            >
              Planes {glance.planosSubidos}/{glance.totalSesiones}
            </span>
          )}
        </div>
        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1.5"
            disabled={generar.isPending}
            onClick={() => generar.mutate({ programId })}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${generar.isPending ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            {generar.isPending ? "Generando..." : "Generar calendario"}
          </Button>
        )}
      </div>

      {sessions.length === 0 && (
        <div className="rounded-xl border bg-muted/30 p-8 text-center">
          <CalendarDays className="mx-auto h-10 w-10 text-muted-foreground mb-3" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            No hay sesiones planificadas.
            {isAdmin && " Usa 'Generar calendario' para crearlas desde el horario del programa."}
          </p>
        </div>
      )}

      {sortedMonthKeys.map((monthKey) => {
        const monthSessions = grouped.get(monthKey) ?? [];
        return (
          <div key={monthKey} className="bocatas-card overflow-hidden">
            <div className="px-4 py-2 bg-muted/50 border-b">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {formatMonthKey(monthKey)}
                <span className="ml-2 font-normal">
                  ({monthSessions.length} sesiones)
                </span>
              </p>
            </div>
            {monthSessions.map((s) => (
              <SesionCalendarRow
                key={s.id}
                session={s}
                isAdmin={isAdmin}
                isLoadingAbrir={abrir.isPending && abrir.variables?.sessionId === s.id}
                isLoadingCancelar={cancelar.isPending && cancelar.variables?.sessionId === s.id}
                isLoadingReprogramar={reprogramar.isPending && reprogramar.variables?.sessionId === s.id}
                onAbrir={(id) => abrir.mutate({ sessionId: id })}
                onCancelar={(id, motivo) => cancelar.mutate({ sessionId: id, motivo })}
                onReprogramar={(id, values) => reprogramar.mutate({ sessionId: id, ...values })}
                onSelect={onSelectSession}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
