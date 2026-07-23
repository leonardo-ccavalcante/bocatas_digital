/**
 * FunnelKpis.tsx — estado-breakdown KPI row for inscribible programs.
 * Shows counts per enrollment estado using getEnrollments data.
 */
import { trpc } from "@/lib/trpc";
import { ESTADO_LABELS } from "@shared/programEstados";
import type { EstadoInscripcion } from "@shared/programEstados";

interface FunnelKpisProps {
  programId: string;
  estadosHabilitados: string[];
}

interface KpiItemProps {
  label: string;
  value: number | undefined;
  colorClass: string;
}

function KpiItem({ label, value, colorClass }: KpiItemProps) {
  return (
    <div className="flex flex-col items-center p-3 rounded-xl bg-card border">
      <span className={`text-2xl font-bold tabular-nums ${colorClass}`}>
        {value ?? "—"}
      </span>
      <span className="text-xs text-muted-foreground text-center mt-0.5">{label}</span>
    </div>
  );
}

const ESTADO_COLORS: Record<string, string> = {
  inscrito: "text-blue-600",
  preseleccionado: "text-amber-600",
  admitido: "text-emerald-600",
  lista_espera: "text-orange-600",
  activo: "text-green-600",
  pausado: "text-gray-500",
  baja: "text-red-600",
  terminado: "text-slate-500",
};

function useEstadoCount(programId: string, estado: EstadoInscripcion) {
  const { data } = trpc.programs.getEnrollments.useQuery(
    { programId, estado, limit: 1, offset: 0 },
    { staleTime: 60_000, enabled: !!programId }
  );
  return data?.total;
}

export function FunnelKpis({ programId, estadosHabilitados }: FunnelKpisProps) {
  const validEstados = estadosHabilitados.filter(
    (e): e is EstadoInscripcion =>
      ["inscrito", "preseleccionado", "admitido", "lista_espera", "activo", "pausado", "baja", "terminado"].includes(e)
  );

  // Fetch count for each enabled estado (each query is cached separately)
  const inscritoCount   = useEstadoCount(programId, "inscrito");
  const preselCount     = useEstadoCount(programId, "preseleccionado");
  const admitidoCount   = useEstadoCount(programId, "admitido");
  const esperaCount     = useEstadoCount(programId, "lista_espera");
  const activoCount     = useEstadoCount(programId, "activo");
  const pausadoCount    = useEstadoCount(programId, "pausado");
  const bajaCount       = useEstadoCount(programId, "baja");
  const terminadoCount  = useEstadoCount(programId, "terminado");

  const countMap: Record<string, number | undefined> = {
    inscrito: inscritoCount,
    preseleccionado: preselCount,
    admitido: admitidoCount,
    lista_espera: esperaCount,
    activo: activoCount,
    pausado: pausadoCount,
    baja: bajaCount,
    terminado: terminadoCount,
  };

  if (validEstados.length === 0) return null;

  return (
    <div aria-label="Desglose por estado de inscripción">
      <h2 className="text-eyebrow text-muted-foreground mb-3">
        Desglose por estado
      </h2>
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${Math.min(validEstados.length, 4)}, minmax(0, 1fr))` }}
        role="list"
      >
        {validEstados.map((estado) => (
          <div key={estado} role="listitem">
            <KpiItem
              label={ESTADO_LABELS[estado]}
              value={countMap[estado]}
              colorClass={ESTADO_COLORS[estado] ?? "text-foreground"}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
