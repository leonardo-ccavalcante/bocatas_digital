/**
 * KPICard — McKinsey/Colenusbaumer style KPI card.
 * Large number, clean label, skeleton on loading, error state with retry.
 */
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";

interface KPICardProps {
  label: string;
  sublabel: string;
  count: number;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  highlight?: boolean; // primary accent for "today"
}

export function KPICard({
  label,
  sublabel,
  count,
  isLoading = false,
  isError = false,
  onRetry,
  highlight = false,
}: KPICardProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card p-3 min-h-[88px] gap-1 animate-pulse">
        <div className="h-7 w-14 rounded bg-muted" />
        <div className="h-3 w-12 rounded bg-muted mt-1" />
        <div className="h-3 w-10 rounded bg-muted" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 p-3 min-h-[88px] gap-1">
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

  return (
    <div
      className={`flex flex-col items-center justify-center rounded-lg border p-3 min-h-[88px] gap-0.5 transition-colors ${
        highlight
          ? "border-primary/40 bg-primary/5"
          : "border-border bg-card"
      }`}
    >
      {/* McKinsey style: label small caps above number */}
      <span className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground leading-none">
        {label}
      </span>
      {/* Large number — primary metric */}
      <span
        className={`text-2xl font-bold tabular-nums leading-tight ${
          highlight ? "text-primary" : "text-foreground"
        }`}
      >
        {count.toLocaleString("es-ES")}
      </span>
      {/* Sublabel */}
      <span className="text-[10px] text-muted-foreground leading-none">{sublabel}</span>
    </div>
  );
}
