/**
 * PersonRowDesktop — single row in the desktop persons table.
 *
 * Renders name/initials avatar, chips de programas (último primero), a
 * creation-date-based recency dot, estado badge, and action buttons.
 * Keyboard-navigable.
 */
import { useLocation } from "wouter";
import { PersonActionsMenu } from "./PersonActionsMenu";
import { Badge } from "@/components/ui/badge";

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
  /**
   * Sólo para poder filtrar por él en el listado de admin: `getAll` ya lo trae
   * y se estaba descartando en el mapeo. No se pinta en ninguna fila.
   */
  numero_documento?: string | null;
  /**
   * Nombres de programas vinculados (último primero, cap 3 en el servidor).
   * Sólo llega por el carril admin (`getAll`); en búsqueda no viaja.
   */
  programas?: string[];
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
      className={`rounded-full flex items-center justify-center font-semibold shrink-0 bg-[#E8E0D2] text-[#4F5742] ${sz}`}
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
  /** Optional inline style — used by the virtualizer to position rows absolutely. */
  style?: React.CSSProperties;
}

export function PersonRowDesktop({
  person,
  active,
  compact,
  onMouseEnter,
  style,
}: PersonRowDesktopProps) {
  const [, navigate] = useLocation();
  const estado = person.fase_itinerario ? "Activa" : "Inactiva";

  const goToDetail = () => navigate(`/personas/${person.id}`);

  return (
    <div
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
      style={style}
      className={`
        grid grid-cols-[1fr_170px_120px_100px_80px] gap-3 items-center px-5 cursor-pointer
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

      {/* Programas (chips: 2 + «+N» sobre el array capado a 3 — indica «hay más») */}
      <span className="text-body-sm text-foreground truncate">
        {person.programas && person.programas.length > 0 ? (
          <span className="inline-flex items-center gap-1">
            {person.programas.slice(0, 2).map((nombre, i) => (
              <span
                key={`${i}-${nombre}`}
                title={nombre}
                className="inline-block max-w-[72px] truncate rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground"
              >
                {nombre}
              </span>
            ))}
            {person.programas.length > 2 && (
              <span className="text-[10px] text-muted-foreground">
                +{person.programas.length - 2}
              </span>
            )}
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

      {/* Acciones. Ya NO son `opacity-0 group-hover:opacity-100`: eso las hacía
          invisibles sin ratón, o sea siempre invisibles en una tableta o un
          teléfono. Ahora el menú está presente y sube de contraste al pasar por
          encima.

          Sustituye a dos botones que no aportaban nada propio: el de «Check-in»
          navegaba a /checkin ignorando por completo a la persona de la fila (y
          esa página ya está en la navegación), y el de «Ver ficha» repetía lo
          que hace pulsar la fila entera. El menú cubre las dos y además abre la
          edición y el QR de ESTA persona. */}
      <div
        className="flex items-center justify-end opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        style={{ opacity: active ? 1 : undefined }}
        onClick={(e) => e.stopPropagation()}
      >
        <PersonActionsMenu
          personId={person.id}
          nombreCompleto={`${person.nombre} ${person.apellidos ?? ""}`.trim()}
          variant="icon"
        />
      </div>
    </div>
  );
}
