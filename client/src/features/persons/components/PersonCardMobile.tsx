/**
 * PersonCardMobile — card layout for the personas list on mobile viewports.
 *
 * Appears below the md breakpoint (sm:hidden equivalent — hidden by the parent
 * at ≥ sm, this component renders inside the ul that is "sm:hidden").
 *
 * La zona de navegación es un HIJO, no la tarjeta entera, para que el menú `⋯`
 * pueda ser su hermano. Antes la tarjeta completa era role="button" y el `⋯` un
 * `<span aria-hidden>` decorativo que no hacía nada — precisamente para no
 * anidar un interactivo dentro de otro. Ahora hay dos objetivos separados.
 *
 * La altura no cambia: ROW_HEIGHT_MOBILE (Personas.tsx) es una estimación FIJA
 * del virtualizador, así que el disparador conserva la huella de 36px del span
 * que sustituye. Crecerlo solapa filas.
 */
import { useLocation } from "wouter";
import { PersonActionsMenu } from "./PersonActionsMenu";
import { EstadoBadge, RecencyDot } from "./PersonRowDesktop";
import type { PersonRowData } from "./PersonRowDesktop";

interface PersonCardMobileProps {
  person: PersonRowData;
}

export function PersonCardMobile({ person }: PersonCardMobileProps) {
  const [, navigate] = useLocation();
  const estado = person.fase_itinerario ? "Activa" : "Inactiva";

  const initials = [person.nombre[0] ?? "", (person.apellidos ?? " ")[0] ?? ""]
    .join("")
    .toUpperCase();

  const nombreCompleto = `${person.nombre} ${person.apellidos ?? ""}`.trim();

  return (
    <div className="bocatas-card p-3 flex items-center gap-3">
      {/* La zona de navegación es un hijo, no el contenedor: el menú `⋯` es su
          HERMANO. Un botón real dentro de otro role="button" es el interactivo
          anidado que el gate de accesibilidad de Lighthouse bloquea, y es la
          razón por la que el `⋯` de antes era un span decorativo. */}
      <div
        role="button"
        tabIndex={0}
        aria-label={`Ver ficha de ${nombreCompleto}`}
        onClick={() => navigate(`/personas/${person.id}`)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            navigate(`/personas/${person.id}`);
          }
        }}
        className="flex min-w-0 flex-1 items-center gap-3 active:scale-[0.99] transition-transform cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            {person.programas && person.programas.length > 0 ? (
              <span
                title={person.programas[0]}
                className="max-w-[110px] truncate rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground"
              >
                {person.programas[0]}
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
      </div>

      <PersonActionsMenu
        personId={person.id}
        nombreCompleto={nombreCompleto}
        variant="card"
      />
    </div>
  );
}
