/**
 * AbsenceAlertsPanel — Shows persons with prolonged absence.
 * McKinsey/Colenusbaumer style: clean table, direct labels, no decorative elements.
 */
import { useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, ChevronDown, ChevronUp, RefreshCw, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAbsenceAlerts, type AbsenceAlert } from "../hooks/useAbsenceAlerts";

interface AbsenceAlertsPanelProps {
  locationId?: string;
  programa?: string;
  thresholdDays?: number;
  /** If true, panel starts collapsed */
  defaultCollapsed?: boolean;
}

const METODO_LABEL: Record<string, string> = {
  comedor: "Comedor Social",
  acompanamiento: "Acompañamiento",
  atencion_juridica: "Atención Jurídica",
  formacion: "Formación",
  familia: "Programa Familias",
  voluntariado: "Voluntariado",
};

function DaysAbsentBadge({ days }: { days: number }) {
  if (days >= 30) {
    return (
      <Badge variant="destructive" className="text-xs font-semibold tabular-nums">
        {days}d
      </Badge>
    );
  }
  if (days >= 21) {
    return (
      <Badge className="text-xs font-semibold tabular-nums bg-orange-500 hover:bg-orange-500 text-white">
        {days}d
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-xs font-semibold tabular-nums">
      {days}d
    </Badge>
  );
}

export function AbsenceAlertsPanel({
  locationId = "all",
  programa = "all",
  thresholdDays = 14,
  defaultCollapsed = false,
}: AbsenceAlertsPanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const { data, count, isLoading, isError, refetch } = useAbsenceAlerts({
    locationId,
    programa,
    thresholdDays,
  });

  return (
    <section
      className="rounded-lg border border-border bg-card"
      aria-label="Alertas de ausencia prolongada"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" aria-hidden="true" />
          <span className="text-sm font-semibold text-card-foreground">
            Ausencias prolongadas
          </span>
          {!isLoading && count > 0 && (
            <Badge
              variant="destructive"
              className="h-5 min-w-[1.25rem] px-1.5 text-xs tabular-nums"
              aria-label={`${count} personas ausentes`}
            >
              {count}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            (sin asistir {thresholdDays}+ días)
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => void refetch()}
            aria-label="Actualizar alertas"
            disabled={isLoading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expandir panel" : "Colapsar panel"}
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Body */}
      {!collapsed && (
        <div className="px-4 py-3">
          {isLoading && (
            <div className="space-y-2" aria-busy="true" aria-label="Cargando alertas">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-8 rounded bg-muted animate-pulse" />
              ))}
            </div>
          )}

          {isError && (
            <div className="flex items-center gap-2 text-sm text-destructive py-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Error al cargar alertas.</span>
              <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => void refetch()}>
                Reintentar
              </Button>
            </div>
          )}

          {!isLoading && !isError && count === 0 && (
            <p className="text-sm text-muted-foreground py-2 text-center">
              Sin ausencias prolongadas en el período seleccionado.
            </p>
          )}

          {!isLoading && !isError && count > 0 && (
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-sm" role="table" aria-label="Personas con ausencia prolongada">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Persona
                    </th>
                    <th className="text-right py-2 pr-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Días ausente
                    </th>
                    <th className="text-right py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">
                      Último check-in
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((alert: AbsenceAlert) => (
                    <tr
                      key={alert.personId}
                      className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="py-2 pr-3">
                        <Link href={`/personas/${alert.personId}`}>
                          <span className="flex items-center gap-1.5 text-primary hover:underline cursor-pointer">
                            <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="font-medium">
                              {alert.nombre} {alert.apellidos}
                            </span>
                          </span>
                        </Link>
                        {alert.restriccionesAlimentarias && (
                          <span className="block text-xs text-amber-600 mt-0.5 pl-5">
                            {alert.restriccionesAlimentarias}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <DaysAbsentBadge days={alert.diasAusente} />
                      </td>
                      <td className="py-2 text-right text-muted-foreground hidden sm:table-cell">
                        {new Date(alert.ultimoCheckin + "T12:00:00Z").toLocaleDateString("es-ES", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {count >= 50 && (
                <p className="text-xs text-muted-foreground text-center pt-2">
                  Mostrando los 50 casos más críticos.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
