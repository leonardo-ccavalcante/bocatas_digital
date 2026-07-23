/**
 * SesionEstadoChip.tsx — Coloured Badge for a session's estado.
 * Pure presentational; no data-fetching.
 */
import { Badge } from "@/components/ui/badge";
import { SESSION_ESTADO_LABELS, type SessionEstado } from "@shared/sessionSchemas";

const ESTADO_VARIANT: Record<SessionEstado, "default" | "secondary" | "destructive" | "outline"> = {
  planificada: "outline",
  abierta: "default",
  cerrada: "secondary",
  cancelada: "destructive",
};

const ESTADO_CLASS: Record<SessionEstado, string> = {
  planificada: "text-muted-foreground border-muted-foreground/30",
  abierta: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900 dark:text-emerald-200",
  cerrada: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900 dark:text-blue-200",
  cancelada: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900 dark:text-red-200 line-through",
};

interface SesionEstadoChipProps {
  estado: SessionEstado;
  className?: string;
}

export function SesionEstadoChip({ estado, className = "" }: SesionEstadoChipProps) {
  return (
    <Badge
      variant={ESTADO_VARIANT[estado]}
      className={`text-xs font-medium ${ESTADO_CLASS[estado]} ${className}`}
    >
      {SESSION_ESTADO_LABELS[estado]}
    </Badge>
  );
}
