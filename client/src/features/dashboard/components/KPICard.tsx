/**
 * KPICard — v4 restyle: matches prototype layout.
 * highlight=true renders solid primary background (today KPI).
 * Includes trend text + delta badge from prototype design.
 */
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";

interface KPICardProps {
  label: string;
  sublabel: string;
  count: number;
  trend?: string;
  deltaPct?: number;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  highlight?: boolean;
}

export function KPICard({
  label,
  sublabel,
  count,
  trend,
  deltaPct,
  isLoading = false,
  isError = false,
  onRetry,
  highlight = false,
}: KPICardProps) {
  if (isLoading) {
    return (
      <div className="bocatas-card flex flex-col p-3 sm:p-4 min-h-[100px] gap-1 animate-pulse">
        <div className="h-3 w-12 rounded bg-muted" />
        <div className="h-8 w-14 rounded bg-muted mt-1" />
        <div className="h-2 w-10 rounded bg-muted" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bocatas-card border-destructive/30 bg-destructive/5 flex flex-col items-center justify-center p-3 min-h-[100px] gap-1">
        <AlertCircle className="h-4 w-4 text-destructive" />
        <span className="text-[10px] text-destructive text-center leading-tight">Error al cargar</span>
        {onRetry && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1 text-[10px] text-destructive"
            onClick={onRetry}
          >
            <RefreshCw className="h-3 w-3 mr-0.5" />
            Reintentar
          </Button>
        )}
      </div>
    );
  }

  if (highlight) {
    return (
      <div className="rounded-2xl p-3 sm:p-4 border bg-primary border-primary text-primary-foreground">
        <div className="flex items-center justify-between">
          <p className="text-eyebrow text-primary-foreground/70">{label}</p>
          {typeof deltaPct === "number" && (
            <span
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-white/20 text-primary-foreground"
              aria-label={`Variación: ${deltaPct >= 0 ? "+" : ""}${deltaPct}%`}
            >
              {deltaPct >= 0 ? "▲" : "▼"} {deltaPct >= 0 ? "+" : ""}{deltaPct}%
            </span>
          )}
        </div>
        <p className="tabular-stat text-2xl sm:text-3xl md:text-4xl font-bold leading-none mt-2 text-primary-foreground">
          {count.toLocaleString("es-ES")}
        </p>
        <p className="text-[11px] mt-1 text-primary-foreground/70">{sublabel}</p>
        {trend && (
          <p className="text-[10px] mt-2 font-medium text-primary-foreground/80">{trend}</p>
        )}
      </div>
    );
  }

  return (
    <div className="bocatas-card p-3 sm:p-4 min-h-[100px]">
      <div className="flex items-center justify-between">
        <p className="text-eyebrow text-muted-foreground">{label}</p>
        {typeof deltaPct === "number" && (
          <span
            className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${
              deltaPct >= 0
                ? "bg-green-50 text-emerald-600 border-green-200"
                : "bg-red-50 text-red-600 border-red-200"
            }`}
            aria-label={`Variación: ${deltaPct >= 0 ? "+" : ""}${deltaPct}%`}
          >
            {deltaPct >= 0 ? "▲" : "▼"} {deltaPct >= 0 ? "+" : ""}{deltaPct}%
          </span>
        )}
      </div>
      <p className="tabular-stat text-2xl sm:text-3xl font-bold leading-none mt-2 text-foreground">
        {count.toLocaleString("es-ES")}
      </p>
      <p className="text-[11px] mt-1 text-muted-foreground">{sublabel}</p>
      {trend && (
        <p
          className={`text-[10px] mt-2 font-medium ${
            typeof deltaPct === "number"
              ? deltaPct >= 0
                ? "text-emerald-600"
                : "text-red-600"
              : "text-muted-foreground"
          }`}
        >
          {trend}
        </p>
      )}
    </div>
  );
}
