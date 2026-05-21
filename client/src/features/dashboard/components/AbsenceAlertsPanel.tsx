/**
 * AbsenceAlertsPanel — v4 restyle: matches prototype card style.
 * Shows persons with prolonged absence. All data wired to real tRPC endpoint.
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
  defaultCollapsed?: boolean;
}

function DaysAbsentBadge({ days }: { days: number }) {
  if (days >= 30) {
    return (
      <Badge variant="destructive" className="text-xs font-semibold tabular-stat">
        {days}d
      </Badge>
    );
  }
  if (days >= 21) {
    return (
      <Badge className="text-xs font-semibold tabular-stat bg-orange-500 hover:bg-orange-500 text-white">
        {days}d
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-xs font-semibold tabular-stat">
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
      className="bocatas-card overflow-hidden"
      aria-label="Alertas de ausencia prolongada"
    >
      {/* Header */}
      <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-border flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-eyebrow text-muted-foreground">Alertas de ausencia</p>
          {!isLoading && (
            <p className="text-body mt-0.5 text-foreground">
              {count > 0
                ? `${count} persona${count === 1 ? "" : "s"} sin visita hace +${thresholdDays} días`
                : "Sin ausencias prolongadas"}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!isLoading && count > 0 && (
            <span className="text-xs px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-semibold">
              {count} {count === 1 ? "nueva" : "nuevas"}
            </span>
          )}
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
        <div>
          {isLoading && (
            <div className="px-4 sm:px-5 py-3 space-y-2" aria-busy="true" aria-label="Cargando alertas">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-11 rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
          )}

          {isError && (
            <div className="px-4 sm:px-5 py-3 flex items-center gap-2 text-body-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Error al cargar alertas.</span>
              <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => void refetch()}>
                Reintentar
              </Button>
            </div>
          )}

          {!isLoading && !isError && count === 0 && (
            <p className="text-body-sm text-muted-foreground px-4 sm:px-5 py-3 text-center">
              Sin ausencias prolongadas en el período seleccionado.
            </p>
          )}

          {!isLoading && !isError && count > 0 && (
            <ul className="divide-y divide-border" role="list">
              {data.map((alert: AbsenceAlert) => (
                <li
                  key={alert.personId}
                  className="px-4 sm:px-5 py-3 flex items-center gap-3 hover:bg-accent/30 transition-colors"
                >
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 bg-accent text-accent-foreground"
                    aria-hidden="true"
                  >
                    {alert.nombre.charAt(0)}
                    {alert.apellidos.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link href={`/personas/${alert.personId}`}>
                      <span className="flex items-center gap-1 text-body font-medium text-foreground hover:text-primary hover:underline cursor-pointer">
                        <User className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="truncate">{alert.nombre} {alert.apellidos}</span>
                      </span>
                    </Link>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                      Último check-in:{" "}
                      {new Date(alert.ultimoCheckin + "T12:00:00Z").toLocaleDateString("es-ES", {
                        day: "2-digit",
                        month: "short",
                      })}
                      {alert.restriccionesAlimentarias && (
                        <span className="text-amber-600 ml-1">
                          &middot; {alert.restriccionesAlimentarias}
                        </span>
                      )}
                    </p>
                  </div>
                  <DaysAbsentBadge days={alert.diasAusente} />
                </li>
              ))}
            </ul>
          )}

          {!isLoading && !isError && count >= 50 && (
            <p className="text-[10px] text-muted-foreground text-center px-4 pb-3">
              Mostrando los 50 casos más críticos.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
