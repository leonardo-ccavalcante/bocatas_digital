/**
 * PersonRowDesktop — single row in the desktop persons table.
 *
 * Renders name/initials avatar, fase badge, creation-date-based recency dot,
 * estado badge, and action buttons. Keyboard-navigable.
 */
import { useLocation } from "wouter";
import { Eye, QrCode } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FASE_ITINERARIO_CONFIG } from "@/features/persons/schemas/labels";

// ─── Recency dot (decorative) ─────────────────────────────────────────────────
// Uses created_at as a proxy (no last_visit field in the API).
// The #9A9A9A-equivalent bg-muted-foreground/40 is allowed for decorative dots.

function recencyRank(isoDate: string | null): number {
  if (!isoDate) return 999;
  const days = Math.floor((Date.now() - new Date(isoDate).getTime()) / 86_400_000);
  return days;
}

interface RecencyDotProps {
  isoDate: string | null;
  small?: boolean;
}

// Recency thresholds (days since created_at, used as a last-activity proxy).
const RECENCY_FRESH_DAYS = 7;
const RECENCY_RECENT_DAYS = 30;
const RECENCY_STALE_DAYS = 90;

export function RecencyDot({ isoDate, small }: RecencyDotProps) {
  const days = recencyRank(isoDate);
  let colorClass: string;
  if (days <= RECENCY_FRESH_DAYS) colorClass = "bg-green-600";
  else if (days <= RECENCY_RECENT_DAYS) colorClass = "bg-yellow-400";
  else if (days <= RECENCY_STALE_DAYS) colorClass = "bg-amber-600";
  else colorClass = "bg-muted-foreground/40";

  const sz = small ? "h-1.5 w-1.5" : "h-[7px] w-[7px]";
  return (
    <span
      aria-hidden="true"
      className={`rounded-full shrink-0 ${colorClass} ${sz}`}
    />
  );
}

// ─── PersonRow data shape ────────────────────────────────────────────────────

export interface PersonRowData {
  id: string;
  nombre: string;
  apellidos: string | null;
  fase_itinerario: string | null;
  created_at?: string | null;
  foto_perfil_url?: string | null;
}

// ─── Avatar initials ────────────────────────────────────────────────────────

function PersonAvatar({
  nombre,
  apellidos,
  compact,
}: {
  nombre: string;
  apellidos: string | null;
  compact?: boolean;
}) {
  const initials = [nombre[0] ?? "", (apellidos ?? " ")[0] ?? ""]
    .join("")
    .toUpperCase();
  const sz = compact ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-[11px]";
  return (
    <div
      className={`rounded-full flex items-center justify-center font-semibold shrink-0 bg-accent text-accent-foreground ${sz}`}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}

// ─── Estado badge ─────────────────────────────────────────────────────────────

export function EstadoBadge({
  estado,
  small,
}: {
  estado: string;
  small?: boolean;
}) {
  if (estado === "Activa") {
    return (
      <Badge
        variant="outline"
        className={`gap-1.5 border-green-200 bg-green-50 text-green-700 ${small ? "text-[10px] px-1.5 py-0.5" : "text-[11px]"}`}
      >
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-green-600 shrink-0" />
        Activa
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className={`gap-1.5 border-border bg-muted text-muted-foreground ${small ? "text-[10px] px-1.5 py-0.5" : "text-[11px]"}`}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
      Inactiva
    </Badge>
  );
}

// ─── PersonRowDesktop ─────────────────────────────────────────────────────────

interface PersonRowDesktopProps {
  person: PersonRowData;
  active: boolean;
  compact: boolean;
  onMouseEnter: () => void;
}

export function PersonRowDesktop({
  person,
  active,
  compact,
  onMouseEnter,
}: PersonRowDesktopProps) {
  const [, navigate] = useLocation();
  const faseConfig = person.fase_itinerario
    ? (FASE_ITINERARIO_CONFIG[person.fase_itinerario] ?? null)
    : null;
  const estado = person.fase_itinerario ? "Activa" : "Inactiva";

  const goToDetail = () => navigate(`/personas/${person.id}`);

  return (
    <li
      role="button"
      tabIndex={0}
      onMouseEnter={onMouseEnter}
      onClick={goToDetail}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          goToDetail();
        }
      }}
      className={`
        grid grid-cols-[1fr_130px_120px_100px_80px] gap-3 items-center px-5 cursor-pointer
        transition-colors group
        ${compact ? "py-2" : "py-3"}
        ${active ? "bg-accent/50" : "hover:bg-accent/30"}
      `}
    >
      {/* Name + avatar */}
      <div className="flex items-center gap-3 min-w-0">
        <PersonAvatar
          nombre={person.nombre}
          apellidos={person.apellidos}
          compact={compact}
        />
        <div className="min-w-0">
          <p
            className={`font-medium text-foreground truncate ${
              compact ? "text-[13px]" : "text-body"
            }`}
          >
            {person.nombre} {person.apellidos ?? ""}
          </p>
          <p className="text-[11px] text-muted-foreground font-mono truncate">
            {person.id.slice(0, 8)}…
          </p>
        </div>
      </div>

      {/* Fase */}
      <span className="text-body-sm text-foreground truncate">
        {faseConfig ? (
          <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${faseConfig.color}`}>
            {faseConfig.label}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </span>

      {/* Recency (created_at as proxy) */}
      <span className="inline-flex items-center gap-1.5 text-body-sm text-muted-foreground">
        <RecencyDot isoDate={person.created_at ?? null} />
        <span className="truncate">
          {person.created_at
            ? new Date(person.created_at).toLocaleDateString("es-ES", {
                day: "numeric",
                month: "short",
              })
            : "—"}
        </span>
      </span>

      {/* Estado */}
      <span>
        <EstadoBadge estado={estado} />
      </span>

      {/* Actions (visible on hover/focus) */}
      <div
        className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ opacity: active ? 1 : undefined }}
        onClick={(e) => e.stopPropagation()}
      >
        <ActionBtn
          icon={<QrCode className="h-3.5 w-3.5" />}
          label="Check-in"
          onClick={() => navigate("/checkin")}
        />
        <ActionBtn
          icon={<Eye className="h-3.5 w-3.5" />}
          label="Ver ficha"
          onClick={goToDetail}
        />
      </div>
    </li>
  );
}

interface ActionBtnProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

function ActionBtn({ icon, label, onClick }: ActionBtnProps) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="h-7 w-7 rounded-md hover:bg-card text-muted-foreground hover:text-foreground inline-flex items-center justify-center transition-colors"
    >
      {icon}
    </button>
  );
}
