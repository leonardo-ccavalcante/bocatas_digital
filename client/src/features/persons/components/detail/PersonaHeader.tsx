/**
 * PersonaHeader — editorial header for the persona ficha (NO sticky: ver abajo).
 *
 * Layout ported from the v4 prototype (persona-detail.jsx): breadcrumb/back,
 * avatar + name + estado pill + identity meta line, and a KPI strip.
 *
 * KPI strip uses ONLY real person fields — no fabricated counts. The check-in
 * count comes from the (admin-only) history query passed down by the page; when
 * it is undefined (non-admin or not loaded) the cell shows an em dash.
 *
 * Las acciones llegan por la prop `acciones` y se pintan dentro de un desplegable
 * «Acciones», plegado por defecto. El header sólo aporta el chrome del
 * desplegable: quién puede hacer qué lo sigue decidiendo PersonaDetalle.
 *
 * Viven aquí y no entre el header y la tira de tabs porque esos dos elementos
 * están pegados a propósito — la tira lleva `-mt-px` para solapar el `border-b`
 * de este header y formar un subrayado continuo. Cualquier cosa intercalada
 * rompe ese contrato y aterriza encima de los tabs.
 *
 * NUNCA esconder acciones por anchura. El bloque `hidden … sm:flex` que había
 * aquí (port visual v4, 1ddf694) borraba el QR y los consentimientos por debajo
 * de 640px — el móvil desde el que se dan las altas — y dejaba a un admin sin
 * NINGUNA ruta al QR de una persona. Plegado no es escondido: el disparador
 * «Acciones» se ve y se pulsa en todos los anchos.
 */
import { useState, type ReactNode } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import BackLink from "@/components/layout/BackLink";
import { formatDateDisplay, calculateAge } from "@/lib/dateUtils";
import type { Database } from "@/lib/database.types";
import { getEstadoChip } from "./personaEstado";

type PersonRow = Database["public"]["Tables"]["persons"]["Row"];

interface PersonaHeaderProps {
  person: PersonRow;
  /** Real check-in total (admin-only). Undefined → cell shows "—". */
  visitas?: number;
  /**
   * Acciones de la ficha (editar, QR, consentimientos, `⋯`). Ausente = sin
   * desplegable, ni siquiera el disparador — es como lo ve un no-admin.
   */
  acciones?: ReactNode;
}

function getInitials(nombre: string, apellidos: string | null): string {
  return [nombre, apellidos ?? ""]
    .join(" ")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function KPICell({
  label,
  value,
  sub,
  bordered,
}: {
  label: string;
  value: string;
  sub: string;
  bordered?: boolean;
}) {
  return (
    <div className={bordered ? "border-l border-border px-5 py-4" : "px-5 py-4"}>
      <p className="text-eyebrow text-muted-foreground">{label}</p>
      <p className="tabular-stat mt-1.5 text-xl font-semibold leading-none text-foreground sm:text-2xl">
        {value}
      </p>
      <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

export function PersonaHeader({ person, visitas, acciones }: PersonaHeaderProps) {
  const fullName = `${person.nombre} ${person.apellidos ?? ""}`.trim();
  const initials = getInitials(person.nombre, person.apellidos);
  const estado = getEstadoChip(person.fase_itinerario);
  const edad = calculateAge(person.fecha_nacimiento);
  const fechaAlta = formatDateDisplay(person.created_at);
  const [kpiOpen, setKpiOpen] = useState(false);
  // Plegado por defecto, por decisión de producto: la ficha abre limpia. El
  // disparador dice «Acciones» y es visible siempre, así que el botón de editar
  // está a dos toques con rótulo — no escondido, que es otra cosa.
  const [accionesOpen, setAccionesOpen] = useState(false);

  return (
    // NO `sticky`. Lo fue, y con la tira de tabs pegada al mismo `top-0` la
    // cabecera ganaba por z-index: en un teléfono de 812px se comía 396 (el 49%
    // de la pantalla) y la tira de tabs desaparecía DEBAJO al primer scroll —
    // sin ninguna forma de volver a Programas o Notas salvo subir del todo. La
    // única pegajosa es la tira de tabs. Verificado en Playwright a 375px.
    <header className="border-b border-border bg-background">
      <div className="mx-auto max-w-6xl px-4 pb-6 pt-5 sm:px-8">
        {/* Breadcrumb / back */}
        <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
          <BackLink label="Personas" href="/personas" />
          <span aria-hidden="true">/</span>
          <span className="font-medium text-foreground">{fullName}</span>
        </div>

        <div className="flex items-start gap-5">
          <Avatar className="h-16 w-16 shrink-0">
            {person.foto_perfil_url && (
              <AvatarImage src={person.foto_perfil_url} alt={fullName} />
            )}
            <AvatarFallback className="bg-[#E8E0D2] text-[#4F5742] text-lg font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-display-2 text-foreground">{fullName}</h1>
              <Badge variant={estado.variant}>{estado.label}</Badge>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-muted-foreground">
              <span className="font-mono text-xs truncate max-w-[200px]">{person.id}</span>
              {edad !== undefined && (
                <>
                  <span aria-hidden="true" className="text-border">
                    ·
                  </span>
                  <span>{edad} años</span>
                </>
              )}
              {person.genero && (
                <>
                  <span aria-hidden="true" className="text-border">
                    ·
                  </span>
                  <span className="capitalize">{person.genero}</span>
                </>
              )}
              <span aria-hidden="true" className="text-border">
                ·
              </span>
              <span className="font-mono text-xs uppercase">
                {person.idioma_principal}
              </span>
            </div>
            {fechaAlta && (
              <p className="mt-2 text-body-sm text-muted-foreground">
                Alta {fechaAlta}
                {person.municipio ? ` · ${person.municipio}` : ""}
              </p>
            )}
          </div>
        </div>

        {/* KPI strip — collapsible to save screen space on mobile */}
        <Collapsible open={kpiOpen} onOpenChange={setKpiOpen} className="mt-4">
          <CollapsibleTrigger asChild>
            <button
              className="flex w-full items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-2 text-sm text-muted-foreground hover:bg-muted/70 transition-colors"
              aria-label={kpiOpen ? "Ocultar datos" : "Ver datos"}
            >
              <span className="font-medium">
                {kpiOpen ? "Ocultar datos" : "Ver datos"}
                {!kpiOpen && (
                  <span className="ml-2 text-xs font-normal">
                    Fase: {estado.label}
                    {visitas !== undefined ? ` · ${visitas} visitas` : ""}
                  </span>
                )}
              </span>
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-200 ${
                  kpiOpen ? "rotate-180" : ""
                }`}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="bocatas-card mt-2 grid grid-cols-2 md:grid-cols-4">
              <KPICell
                label="Visitas"
                value={visitas !== undefined ? String(visitas) : "—"}
                sub="check-ins"
              />
              <KPICell
                label="Idioma"
                value={person.idioma_principal.toUpperCase()}
                sub="principal"
                bordered
              />
              <KPICell
                label="Empadronado"
                value={
                  person.empadronado === null ? "—" : person.empadronado ? "Sí" : "No"
                }
                sub="estado"
                bordered
              />
              <KPICell
                label="Fase"
                value={estado.label}
                sub="itinerario"
                bordered
              />
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Acciones — mismo patrón visual que «Ver datos», debajo y a ancho
            completo. A ancho completo y no en la misma fila que «Ver datos»
            porque el contenido de un Collapsible de Radix vive DENTRO de su
            raíz: en una columna estrecha, las cuatro acciones se romperían a
            cuatro líneas. */}
        {acciones && (
          <Collapsible open={accionesOpen} onOpenChange={setAccionesOpen} className="mt-2">
            <CollapsibleTrigger asChild>
              <button
                className="flex w-full items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-2 text-sm text-muted-foreground hover:bg-muted/70 transition-colors"
                aria-label={accionesOpen ? "Ocultar acciones" : "Acciones"}
              >
                <span className="font-medium">
                  {accionesOpen ? "Ocultar acciones" : "Acciones"}
                </span>
                <ChevronDown
                  className={`h-4 w-4 transition-transform duration-200 ${
                    accionesOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 flex flex-wrap items-center gap-2">{acciones}</div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </header>
  );
}
