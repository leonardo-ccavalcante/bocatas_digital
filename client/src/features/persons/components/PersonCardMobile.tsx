/**
 * PersonCardMobile — card layout for the personas list on mobile viewports.
 *
 * Appears below the md breakpoint (sm:hidden equivalent — hidden by the parent
 * at ≥ sm, this component renders inside the ul that is "sm:hidden").
 */
import { useLocation } from "wouter";
import { MoreHorizontal } from "lucide-react";
import { FASE_ITINERARIO_CONFIG } from "@/features/persons/schemas/labels";
import { EstadoBadge, RecencyDot } from "./PersonRowDesktop";
import type { PersonRowData } from "./PersonRowDesktop";

interface PersonCardMobileProps {
  person: PersonRowData;
}

export function PersonCardMobile({ person }: PersonCardMobileProps) {
  const [, navigate] = useLocation();
  const faseConfig = person.fase_itinerario
    ? (FASE_ITINERARIO_CONFIG[person.fase_itinerario] ?? null)
    : null;
  const estado = person.fase_itinerario ? "Activa" : "Inactiva";

  const initials = [person.nombre[0] ?? "", (person.apellidos ?? " ")[0] ?? ""]
    .join("")
    .toUpperCase();

  return (
    <li
      role="button"
      tabIndex={0}
      aria-label={`Ver ficha de ${person.nombre} ${person.apellidos ?? ""}`.trim()}
      onClick={() => navigate(`/personas/${person.id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(`/personas/${person.id}`);
        }
      }}
      className="bocatas-card p-3 flex items-center gap-3 active:scale-[0.99] transition-transform cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* Avatar */}
      <div
        aria-hidden="true"
        className="h-10 w-10 rounded-full flex items-center justify-center font-semibold text-[11px] shrink-0 bg-[#E8E0D2] text-[#4F5742]"
      >
        {initials}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-body font-semibold truncate text-foreground">
            {person.nombre} {person.apellidos ?? ""}
          </p>
          <EstadoBadge estado={estado} small />
        </div>
        <p className="text-[11px] text-muted-foreground font-mono truncate mt-0.5">
          {person.id.slice(0, 8)}…
        </p>
        <div className="flex items-center gap-2 mt-1.5 text-[11px]">
          {faseConfig ? (
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${faseConfig.color}`}>
              {faseConfig.label}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
          <span className="text-muted-foreground">·</span>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <RecencyDot isoDate={person.created_at ?? null} small />
            {person.created_at
              ? new Date(person.created_at).toLocaleDateString("es-ES", {
                  day: "numeric",
                  month: "short",
                })
              : "—"}
          </span>
        </div>
      </div>

      {/* Visual affordance only — the whole card is the interactive element.
          aria-hidden + tabIndex=-1 so AT/keyboard users get a single target (the <li>). */}
      <span
        aria-hidden="true"
        className="h-9 w-9 rounded-full inline-flex items-center justify-center text-muted-foreground shrink-0"
      >
        <MoreHorizontal className="h-4 w-4" />
      </span>
    </li>
  );
}
