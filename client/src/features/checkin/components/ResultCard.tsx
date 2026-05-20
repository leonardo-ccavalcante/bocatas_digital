/**
 * ResultCard.tsx — Shows the result of a check-in attempt.
 *
 * States: registered | duplicate | not_found | error | offline
 *
 * WCAG 2.1 AA: result is conveyed through color + icon (non-text) so that
 * volunteers can understand it at a glance regardless of literacy level.
 * role="status" + aria-live="polite" + per-state aria-label provide the
 * assistive-technology announcement.
 */
import { type ComponentType } from "react";
import { CheckCircle2, XCircle, AlertTriangle, WifiOff } from "lucide-react";
import type { CheckinContext } from "../machine/checkinMachine";

// Per-state visual configuration — drives color, icon, and copy.
// All state entries are exhaustive so TypeScript catches missing states.
type StateConfig = {
  /** Tailwind classes for the outer card background */
  cardBg: string;
  /** Tailwind classes for the card border */
  cardBorder: string;
  /** Tailwind classes for the icon container */
  iconBg: string;
  /** Tailwind classes for the icon itself */
  iconColor: string;
  /** Tailwind classes for the title text */
  titleColor: string;
  /** Human-readable title */
  title: string;
  /** Human-readable subtitle */
  sub: string;
  /** Lucide icon component */
  Icon: ComponentType<{ className?: string }>;
};

const STATE_CONFIG = {
  registered: {
    cardBg: "bg-emerald-50",
    cardBorder: "border-emerald-200",
    iconBg: "bg-white",
    iconColor: "text-emerald-600",
    titleColor: "text-emerald-700",
    title: "Registrado",
    sub: "Asistencia registrada hoy",
    Icon: CheckCircle2,
  },
  duplicate: {
    cardBg: "bg-amber-50",
    cardBorder: "border-amber-200",
    iconBg: "bg-white",
    iconColor: "text-amber-600",
    titleColor: "text-amber-700",
    title: "Ya registrado",
    sub: "Esta persona ya hizo check-in hoy",
    Icon: AlertTriangle,
  },
  not_found: {
    cardBg: "bg-red-50",
    cardBorder: "border-red-200",
    iconBg: "bg-white",
    iconColor: "text-red-600",
    titleColor: "text-red-700",
    title: "QR no reconocido",
    sub: "Usa búsqueda manual o registra a la persona",
    Icon: XCircle,
  },
  error: {
    cardBg: "bg-red-50",
    cardBorder: "border-red-200",
    iconBg: "bg-white",
    iconColor: "text-red-600",
    titleColor: "text-red-700",
    title: "Error",
    sub: "Inténtalo de nuevo",
    Icon: XCircle,
  },
  offline: {
    cardBg: "bg-sky-50",
    cardBorder: "border-sky-200",
    iconBg: "bg-white",
    iconColor: "text-sky-600",
    titleColor: "text-sky-700",
    title: "Encolado offline",
    sub: "Se sincronizará al recuperar conexión",
    Icon: WifiOff,
  },
} satisfies Record<string, StateConfig>;

export type ResultState = keyof typeof STATE_CONFIG;
export const RESULT_STATES = Object.keys(STATE_CONFIG) as ResultState[];

interface ResultCardProps {
  stateValue: ResultState;
  context: CheckinContext;
  onReset: () => void;
}

// WCAG 2.1 AA: deterministic spoken phrase per state for assistive technology.
const RESULT_ARIA_LABELS: Record<ResultState, string> = {
  registered: "Check-in registrado correctamente",
  duplicate: "Persona ya registrada hoy",
  not_found: "Persona no encontrada",
  error: "Error al registrar el check-in",
  offline: "Check-in guardado sin conexión",
};

export function ResultCard({ stateValue, context, onReset }: ResultCardProps) {
  const cfg = STATE_CONFIG[stateValue];
  const { Icon } = cfg;

  const personName = context.person
    ? `${context.person.nombre}${context.person.apellidos ? " " + context.person.apellidos : ""}`
    : null;

  const subtitleText =
    stateValue === "duplicate" && context.lastCheckinTime
      ? `Ya registrado · hora anterior: ${context.lastCheckinTime}`
      : stateValue === "error" && context.errorMessage
        ? context.errorMessage
        : cfg.sub;

  return (
    <div
      className="w-full max-w-sm animate-in fade-in slide-in-from-bottom-4 duration-300"
      role="status"
      aria-live="polite"
      aria-label={RESULT_ARIA_LABELS[stateValue]}
    >
      <div
        className={`rounded-3xl border-2 p-6 text-center ${cfg.cardBg} ${cfg.cardBorder}`}
      >
        {/* Icon container */}
        <div
          className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center shadow-md ${cfg.iconBg} ${cfg.iconColor}`}
          aria-hidden="true"
        >
          <Icon className="h-8 w-8" />
        </div>

        {/* Title */}
        <h2 className={`text-xl font-bold mt-4 ${cfg.titleColor}`}>
          {cfg.title}
        </h2>

        {/* Subtitle */}
        <p className="text-sm text-foreground/70 mt-1">{subtitleText}</p>

        {/* Person panel */}
        {personName && context.person && (
          <div className="mt-4 rounded-2xl bg-white/70 p-4 flex items-center gap-3 text-left">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm shrink-0 bg-primary/10 text-primary"
              aria-hidden="true"
            >
              {`${context.person.nombre[0] ?? ""}${context.person.apellidos?.[0] ?? ""}`}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{personName}</p>
            </div>
          </div>
        )}

        {/* Dietary restriction alert */}
        {stateValue === "registered" && context.restriccionesAlimentarias && (
          <div className="mt-3 rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-2 text-center">
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">
              Restricción alimentaria
            </p>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold border bg-white text-amber-800 border-amber-300">
              ⚠️ {context.restriccionesAlimentarias}
            </span>
          </div>
        )}

        {/* Reset button */}
        <button
          type="button"
          onClick={onReset}
          className="mt-5 inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 min-h-[44px] text-sm font-semibold text-white w-full bg-foreground hover:bg-foreground/90 transition-colors"
        >
          Listo · escanear otro
        </button>
      </div>
    </div>
  );
}
