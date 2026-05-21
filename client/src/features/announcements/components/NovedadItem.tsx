/**
 * NovedadItem.tsx — Single announcement card in the Novedades feed.
 *
 * Data decisions (investigated from server/routers/announcements/):
 *
 *  fijado (pin):   EXISTS — togglePin mutation (admin-only). Rendered active;
 *                  button fires useTogglePinAnnouncement. Non-admins see the
 *                  button disabled with aria-disabled.
 *
 *  Read/unread:    DOES NOT EXIST — no field on announcements row, no read-state
 *                  table, no mutation. Unread dot and "Marcar leído" button are
 *                  rendered in a visually-present but disabled state.
 *                  // TODO(frontend-v4): needs read_state field/endpoint
 *
 *  Reach bar:      DOES NOT EXIST — no reads/totalAudience aggregation in the
 *                  router or DB. The progress bar is rendered empty (value=0)
 *                  with a "— / —" label.
 *                  // TODO(frontend-v4): needs reach aggregation endpoint
 */

import { AlertTriangle, Pin, Users, Check, Share2 } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { useTogglePinAnnouncement } from "../hooks/useAnnouncements";
import { getCategoryMeta } from "../categories";
import { getDaysDiff } from "../feedHelpers";
import { useAuth } from "@/_core/hooks/useAuth";
import type { BocatasRole } from "@/components/layout/ProtectedRoute";
import { cn } from "@/lib/utils";

const ADMIN_ROLES: BocatasRole[] = ["admin", "superadmin"];
const VALID_BOCATAS_ROLES: BocatasRole[] = [
  "superadmin",
  "admin",
  "voluntario",
  "beneficiario",
];

export interface AnnouncementFeedRow {
  id: string;
  titulo: string;
  contenido: string;
  tipo: string;
  es_urgente: boolean;
  fijado: boolean;
  autor_nombre: string | null;
  created_at: string;
  /** Audience rules array (from the join) */
  announcement_audiences?: Array<{ roles: string[]; programs: string[] }>;
}

interface NovedadItemProps {
  announcement: AnnouncementFeedRow;
}

/** Format created_at as a compact relative label for display in the card header */
function formatRelativeDate(createdAt: string, now: Date): string {
  const itemDate = new Date(createdAt);
  // Reuse getDaysDiff to avoid duplicating midnight-normalization arithmetic
  const daysDiff = getDaysDiff(createdAt, now);

  const timeStr = itemDate.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Future items (daysDiff < 0) and today (daysDiff === 0) show "Hoy · HH:mm"
  if (daysDiff <= 0) return `Hoy · ${timeStr}`;
  if (daysDiff === 1) return `Ayer · ${timeStr}`;
  if (daysDiff <= 6) return `Hace ${daysDiff} días`;
  if (daysDiff <= 13) return "Hace 1 semana";
  return itemDate.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
  });
}

/** Action button: small icon-only button in the card footer */
function ActionButton({
  onClick,
  active,
  label,
  disabled,
  children,
}: {
  onClick?: () => void;
  active?: boolean;
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={cn(
        "h-8 w-8 inline-flex items-center justify-center rounded-md transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "text-primary bg-accent"
          : "text-muted-foreground hover:text-foreground hover:bg-accent",
        disabled && "opacity-40 cursor-not-allowed pointer-events-none"
      )}
    >
      {children}
    </button>
  );
}

export function NovedadItem({ announcement: a }: NovedadItemProps) {
  const { user } = useAuth();
  const rawRole = user?.role as string | undefined;
  const role: BocatasRole =
    rawRole && VALID_BOCATAS_ROLES.includes(rawRole as BocatasRole)
      ? (rawRole as BocatasRole)
      : "beneficiario";
  const isAdmin = ADMIN_ROLES.includes(role);

  const togglePin = useTogglePinAnnouncement();
  const catMeta = getCategoryMeta(a.tipo);
  const now = new Date();

  const initials = (a.autor_nombre ?? "?")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const relativeDate = formatRelativeDate(a.created_at, now);

  return (
    <article
      className={cn(
        "relative rounded-2xl border bg-card transition-shadow",
        a.es_urgente
          ? "border-destructive/30 shadow-sm ring-1 ring-destructive/10"
          : "border-border"
      )}
      aria-label={a.titulo}
    >
      {/* Unread dot — disabled: no read_state field */}
      {/* TODO(frontend-v4): needs read_state field/endpoint — dot always hidden */}

      <div className="px-5 pt-4 pb-3">
        {/* Row: chips + timestamp */}
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          {/* Category chip */}
          <span
            className={cn(
              "inline-flex items-center gap-1 px-2 h-5 rounded-full",
              "text-[10px] font-bold uppercase tracking-wider border",
              catMeta.chipClass
            )}
          >
            {a.es_urgente && (
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            )}
            {a.es_urgente ? "Urgente" : catMeta.label}
          </span>

          {/* Urgente badge (secondary) when also shown alongside normal tipo */}
          {a.es_urgente && (
            <span className="inline-flex items-center gap-1 px-2 h-5 rounded-full text-[10px] font-semibold uppercase tracking-wider border bg-destructive/5 text-destructive border-destructive/20">
              {catMeta.label}
            </span>
          )}

          {/* Pinned badge */}
          {a.fijado && (
            <span className="inline-flex items-center gap-1 px-2 h-5 rounded-full text-[10px] font-semibold border bg-muted text-muted-foreground border-border">
              <Pin className="h-3 w-3" aria-hidden="true" />
              Anclado
            </span>
          )}

          <span className="text-[11px] text-muted-foreground ml-auto tabular-stat whitespace-nowrap">
            {relativeDate}
          </span>
        </div>

        {/* Title — link to detail */}
        <Link href={`/novedades/${a.id}`}>
          <h3 className="text-h3 text-foreground hover:text-primary transition-colors cursor-pointer leading-snug">
            {a.titulo}
          </h3>
        </Link>

        <p className="mt-1.5 text-body-sm text-foreground/75 leading-relaxed line-clamp-3">
          {a.contenido}
        </p>

        {/* Author row */}
        <div className="mt-3 flex items-center gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 bg-muted text-foreground"
              aria-hidden="true"
            >
              {initials}
            </div>
            <p className="text-[12px] font-medium text-foreground leading-tight truncate">
              {a.autor_nombre ?? "Equipo Bocatas"}
            </p>
          </div>

          {/* Audience summary (roles from first audience rule) */}
          {(a.announcement_audiences ?? []).length > 0 && (
            <>
              <span className="hidden sm:inline-block h-4 w-px bg-border" aria-hidden="true" />
              <div className="hidden sm:flex items-center gap-1.5 text-[12px] text-muted-foreground min-w-0">
                <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">
                  {(a.announcement_audiences![0].roles as string[]).length === 0
                    ? "Todos"
                    : (a.announcement_audiences![0].roles as string[]).join(", ")}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Footer: reach bar + action buttons */}
      <div className="border-t border-border px-5 py-2.5 flex items-center gap-3">
        {/* Reach bar — TODO(frontend-v4): needs reach aggregation endpoint */}
        <div
          className="flex items-center gap-2 min-w-0 flex-1"
          title="Alcance (sin datos disponibles)"
        >
          <Progress
            value={0}
            className="h-1 flex-1 max-w-[140px] bg-border"
            aria-label="Alcance de lectura"
          />
          <span className="text-[11px] tabular-stat text-muted-foreground whitespace-nowrap">
            {/* TODO(frontend-v4): needs reach aggregation endpoint */}
            — / —
          </span>
        </div>

        <div className="flex items-center gap-0.5">
          {/* Mark read — TODO(frontend-v4): needs read_state field/endpoint */}
          <ActionButton
            label="Marcar leído (no disponible)"
            disabled
            active={false}
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          </ActionButton>

          {/* Pin / Unpin — real mutation, admin-only */}
          <ActionButton
            onClick={
              isAdmin
                ? () => togglePin.mutate({ id: a.id })
                : undefined
            }
            active={a.fijado}
            disabled={!isAdmin}
            label={a.fijado ? "Desanclar novedad" : "Anclar novedad"}
          >
            <Pin
              className="h-3.5 w-3.5"
              fill={a.fijado ? "currentColor" : "none"}
              aria-hidden="true"
            />
          </ActionButton>

          {/* Share — uses Web Share API on mobile; clipboard fallback on desktop */}
          <ActionButton
            onClick={() => {
              const url = `${window.location.origin}/novedades/${a.id}`;
              if (navigator.share) {
                void navigator.share({ title: a.titulo, url });
              } else {
                void navigator.clipboard?.writeText(url);
                toast("Enlace copiado");
              }
            }}
            label="Compartir novedad"
          >
            <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
          </ActionButton>
        </div>
      </div>
    </article>
  );
}
