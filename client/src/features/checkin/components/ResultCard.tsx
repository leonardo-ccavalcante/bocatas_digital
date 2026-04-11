/**
 * ResultCard.tsx — Shows the result of a check-in attempt.
 *
 * States: registered | duplicate | not_found | error | offline
 */
import { CheckCircle2, XCircle, AlertTriangle, Clock, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { CheckinContext } from "../machine/checkinMachine";

interface ResultCardProps {
  stateValue: "registered" | "duplicate" | "not_found" | "error" | "offline";
  context: CheckinContext;
  onReset: () => void;
}

const DIETARY_BADGE_COLORS: Record<string, string> = {
  "Sin gluten": "bg-amber-100 text-amber-800 border-amber-300",
  "Vegetariano": "bg-green-100 text-green-800 border-green-300",
  "Vegano": "bg-emerald-100 text-emerald-800 border-emerald-300",
  "Sin lactosa": "bg-blue-100 text-blue-800 border-blue-300",
  "Halal": "bg-purple-100 text-purple-800 border-purple-300",
  "Kosher": "bg-indigo-100 text-indigo-800 border-indigo-300",
  "Sin mariscos": "bg-cyan-100 text-cyan-800 border-cyan-300",
  "Sin frutos secos": "bg-orange-100 text-orange-800 border-orange-300",
};

function DietaryBadge({ restriction }: { restriction: string }) {
  const colorClass = DIETARY_BADGE_COLORS[restriction] ?? "bg-rose-100 text-rose-800 border-rose-300";
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold border ${colorClass}`}>
      ⚠️ {restriction}
    </span>
  );
}

export function ResultCard({ stateValue, context, onReset }: ResultCardProps) {
  const personName = context.person
    ? `${context.person.nombre} ${context.person.apellidos}`
    : null;

  return (
    <div className="flex flex-col items-center gap-5 py-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Icon + Title */}
      {stateValue === "registered" && (
        <>
          <div className="rounded-full bg-green-100 p-5">
            <CheckCircle2 className="w-12 h-12 text-green-600" />
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-bold text-green-700">¡Check-in registrado!</h2>
            {personName && (
              <p className="text-lg text-foreground mt-1 font-medium">{personName}</p>
            )}
            <p className="text-sm text-muted-foreground mt-1">
              {new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>

          {/* Dietary restriction alert */}
          {context.restriccionesAlimentarias && (
            <div className="w-full max-w-sm rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-center">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
                Restricción alimentaria
              </p>
              <DietaryBadge restriction={context.restriccionesAlimentarias} />
            </div>
          )}
        </>
      )}

      {stateValue === "duplicate" && (
        <>
          <div className="rounded-full bg-yellow-100 p-5">
            <Clock className="w-12 h-12 text-yellow-600" />
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-bold text-yellow-700">Ya registrado hoy</h2>
            {personName && (
              <p className="text-lg text-foreground mt-1 font-medium">{personName}</p>
            )}
            {context.lastCheckinTime && (
              <p className="text-sm text-muted-foreground mt-1">
                Hora del check-in anterior: <strong>{context.lastCheckinTime}</strong>
              </p>
            )}
          </div>
        </>
      )}

      {stateValue === "not_found" && (
        <>
          <div className="rounded-full bg-red-100 p-5">
            <XCircle className="w-12 h-12 text-red-600" />
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-bold text-red-700">Persona no encontrada</h2>
            <p className="text-sm text-muted-foreground mt-1">
              El código QR no corresponde a ningún beneficiario registrado.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Usa la búsqueda manual o registra a la persona primero.
            </p>
          </div>
        </>
      )}

      {stateValue === "error" && (
        <>
          <div className="rounded-full bg-red-100 p-5">
            <AlertTriangle className="w-12 h-12 text-red-600" />
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-bold text-red-700">Error</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {context.errorMessage ?? "Error inesperado. Intenta de nuevo."}
            </p>
          </div>
        </>
      )}

      {stateValue === "offline" && (
        <>
          <div className="rounded-full bg-slate-100 p-5">
            <WifiOff className="w-12 h-12 text-slate-600" />
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-bold text-slate-700">Guardado sin conexión</h2>
            {personName && (
              <p className="text-lg text-foreground mt-1 font-medium">{personName}</p>
            )}
            <p className="text-sm text-muted-foreground mt-1">
              Se sincronizará automáticamente cuando haya conexión.
            </p>
          </div>
        </>
      )}

      {/* Reset button */}
      <Button
        variant="outline"
        onClick={onReset}
        className="mt-2 min-w-32"
      >
        Siguiente
      </Button>
    </div>
  );
}
