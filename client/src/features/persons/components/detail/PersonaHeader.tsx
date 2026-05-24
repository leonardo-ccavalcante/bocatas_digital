/**
 * PersonaHeader — sticky editorial header for the persona ficha.
 *
 * Layout ported from the v4 prototype (persona-detail.jsx): breadcrumb/back,
 * avatar + name + estado pill + identity meta line, and a KPI strip.
 *
 * KPI strip uses ONLY real person fields — no fabricated counts. The check-in
 * count comes from the (admin-only) history query passed down by the page; when
 * it is undefined (non-admin or not loaded) the cell shows an em dash.
 */
import { Link } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QrCode, Shield } from "lucide-react";
import BackLink from "@/components/layout/BackLink";
import { formatDateDisplay, calculateAge } from "@/lib/dateUtils";
import type { Database } from "@/lib/database.types";
import { getEstadoChip } from "./personaEstado";

type PersonRow = Database["public"]["Tables"]["persons"]["Row"];

interface PersonaHeaderProps {
  person: PersonRow;
  /** Real check-in total (admin-only). Undefined → cell shows "—". */
  visitas?: number;
  onConsent: () => void;
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

export function PersonaHeader({ person, visitas, onConsent }: PersonaHeaderProps) {
  const fullName = `${person.nombre} ${person.apellidos ?? ""}`.trim();
  const initials = getInitials(person.nombre, person.apellidos);
  const estado = getEstadoChip(person.fase_itinerario);
  const edad = calculateAge(person.fecha_nacimiento);
  const fechaAlta = formatDateDisplay(person.created_at);

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
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

          {/* Quick actions */}
          <div className="hidden shrink-0 flex-col gap-2 sm:flex">
            <Link href={`/personas/${person.id}/qr`}>
              <Button size="sm" variant="outline" aria-label="Ver código QR">
                <QrCode className="h-4 w-4" />
              </Button>
            </Link>
            <Button
              size="sm"
              variant="outline"
              onClick={onConsent}
              aria-label="Gestionar consentimientos"
            >
              <Shield className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* KPI strip — real fields only */}
        <div className="bocatas-card mt-6 grid grid-cols-2 md:grid-cols-4">
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
      </div>
    </header>
  );
}
