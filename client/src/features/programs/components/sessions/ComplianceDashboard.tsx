/**
 * ComplianceDashboard.tsx — Tela 4: Compliance metrics for an edicion program.
 *
 * Shows:
 *  - Planes de clase subidos N/M (progress bar)
 *  - Cierres registrados N/M (progress bar)
 *  - Sesiones pendientes list
 *  - Ausencias destacadas: alumnos with ≥2 consecutive absences
 *    (chip "N faltas → contactar" — ALERT for human, NEVER auto-baja)
 */
import { trpc } from "@/lib/trpc";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ClipboardCheck, AlertTriangle, Clock } from "lucide-react";

interface ComplianceDashboardProps {
  programId: string;
}

function ProgressRow({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-foreground font-medium">{label}</span>
        <span className="text-muted-foreground font-mono">
          {value} de {total}
        </span>
      </div>
      <Progress value={pct} className="h-2" aria-label={`${label}: ${value} de ${total}`} />
      <p className="text-xs text-right text-muted-foreground">{pct}%</p>
    </div>
  );
}

export function ComplianceDashboard({ programId }: ComplianceDashboardProps) {
  const { data, isLoading, error } = trpc.programs.compliance.getComplianceEdicion.useQuery(
    { programId },
    { enabled: !!programId, staleTime: 60_000 }
  );

  if (isLoading) {
    return (
      <div className="space-y-4 py-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
      </div>
    );
  }

  if (error || !data) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Error al cargar métricas de cumplimiento.
          {error && ` ${error.message}`}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Progress bars */}
      <div className="bocatas-card p-5 space-y-5">
        <div className="flex items-center gap-2 mb-1">
          <ClipboardCheck className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <h3 className="text-h3 text-foreground">Cumplimiento</h3>
        </div>
        <ProgressRow
          label="Planes de clase subidos"
          value={data.planosSubidos}
          total={data.totalSesiones}
        />
        <ProgressRow
          label="Cierres registrados"
          value={data.sesionesCerradas}
          total={data.totalSesiones}
        />
      </div>

      {/* Pending sessions */}
      {data.sesionesPendientesCount > 0 && (
        <div className="bocatas-card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-500" aria-hidden="true" />
            <h3 className="text-h3 text-foreground">
              Sesiones pendientes de cierre
              <span className="ml-2 text-xs text-muted-foreground font-mono">
                ({data.sesionesPendientesCount})
              </span>
            </h3>
          </div>
          <div className="space-y-1.5">
            {data.sesionesPendientes.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between text-sm rounded-lg bg-muted/40 px-3 py-2"
              >
                <span className="font-medium">{s.fecha}</span>
                {s.hora_fin && (
                  <span className="text-muted-foreground text-xs">hasta las {s.hora_fin}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Absence alerts */}
      {data.ausenciasAlerta.length > 0 && (
        <div className="bocatas-card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
            <h3 className="text-h3 text-foreground">Ausencias destacadas</h3>
          </div>
          <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/40">
            <AlertDescription className="text-xs text-amber-800 dark:text-amber-200">
              Alumnos con 2 o más faltas consecutivas. Estas son alertas para una persona:
              no se genera ninguna baja automática.
            </AlertDescription>
          </Alert>
          <div className="space-y-2">
            {data.ausenciasAlerta.map((alert) => (
              <div
                key={alert.personId}
                className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
              >
                <span className="text-sm font-medium">
                  {alert.nombre} {alert.apellidos}
                </span>
                <Badge
                  variant="destructive"
                  className="text-xs shrink-0"
                  aria-label={`${alert.consecutiveAbsences} faltas consecutivas`}
                >
                  {alert.consecutiveAbsences} faltas → contactar
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.ausenciasAlerta.length === 0 && data.sesionesPendientesCount === 0 && (
        <div className="rounded-xl border bg-emerald-50 dark:bg-emerald-950/20 p-6 text-center">
          <ClipboardCheck className="mx-auto h-8 w-8 text-emerald-600 mb-2" aria-hidden="true" />
          <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
            Sin alertas de cumplimiento
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Todas las sesiones están al día.
          </p>
        </div>
      )}
    </div>
  );
}
