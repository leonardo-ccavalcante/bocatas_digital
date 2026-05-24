/**
 * FamiliaHeader — editorial header + KPI strip for the familia ficha.
 *
 * Layout ported from the v4 prototype (familias.jsx · FamiliaDetail): BackLink
 * breadcrumb, "Familia #N" title + estado pill + titular line, action buttons
 * (Dar de baja / Reactivar), and a KPI strip.
 *
 * KPI strip uses ONLY real family fields — no fabricated counts, deliveries or
 * GUF data. When a datum is absent the cell shows an em dash.
 */
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import BackLink from "@/components/layout/BackLink";
import { cn } from "@/lib/utils";
import type { Titular } from "./types";

interface FamiliaHeaderProps {
  familiaNumero: number;
  estado: string;
  titular: Titular | null;
  numAdultos: number;
  numMenores: number;
  altaEnGuf: boolean;
  fechaAltaGuf: string | null;
  personaRecoge: string | null;
  autorizado: boolean | null;
  informeSocial: boolean;
  /** Action slot — Dar de baja / Reactivar live in the page (own the mutations). */
  actions: React.ReactNode;
}

function KPICell({
  label,
  value,
  sub,
  alert,
  bordered,
}: {
  label: string;
  value: string;
  sub?: string;
  alert?: boolean;
  bordered?: boolean;
}) {
  return (
    <div className={bordered ? "border-l border-border px-5 py-4" : "px-5 py-4"}>
      <p className="text-eyebrow text-muted-foreground">{label}</p>
      <p
        className={cn(
          "tabular-stat mt-1.5 text-h3 leading-none",
          alert ? "text-amber-700" : "text-foreground",
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function FamiliaHeader({
  familiaNumero,
  estado,
  titular,
  numAdultos,
  numMenores,
  altaEnGuf,
  fechaAltaGuf,
  personaRecoge,
  autorizado,
  informeSocial,
  actions,
}: FamiliaHeaderProps) {
  const totalMiembros = numAdultos + numMenores;

  return (
    <header className="border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto w-full max-w-6xl px-4 pb-6 pt-5 sm:px-8">
        {/* Breadcrumb / back */}
        <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
          <BackLink label="Familias" href="/familias" />
          <span aria-hidden="true">/</span>
          <span className="font-medium text-foreground">
            Familia #{familiaNumero}
          </span>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-display-2 text-foreground">
                Familia #{familiaNumero}
              </h1>
              <Badge variant={estado === "activa" ? "default" : "secondary"}>
                {estado === "activa" ? "Activa" : "En baja"}
              </Badge>
            </div>
            {titular ? (
              <p className="mt-1.5 text-body-sm text-muted-foreground">
                Titular:{" "}
                <Link
                  href={`/personas/${titular.id}`}
                  className="font-medium text-foreground hover:underline"
                >
                  {titular.nombre} {titular.apellidos ?? ""}
                </Link>
                {titular.telefono ? ` · ${titular.telefono}` : ""}
              </p>
            ) : (
              <p className="mt-1.5 text-body-sm text-muted-foreground">
                Sin datos del titular
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
        </div>

        {/* KPI strip — real fields only */}
        <div className="bocatas-card mt-6 grid grid-cols-2 md:grid-cols-4">
          <KPICell
            label="Miembros"
            value={String(totalMiembros)}
            sub={`${numAdultos} adultos · ${numMenores} menores`}
          />
          <KPICell
            label="Recoge"
            value={personaRecoge?.trim() ? personaRecoge : "—"}
            sub={autorizado === true ? "autorizado" : "persona de recogida"}
            bordered
          />
          <KPICell
            label="GUF"
            value={altaEnGuf ? "Alta" : "Sin alta"}
            sub={altaEnGuf && fechaAltaGuf ? `desde ${fechaAltaGuf}` : "estado"}
            alert={!altaEnGuf}
            bordered
          />
          <KPICell
            label="Informe social"
            value={informeSocial ? "Al día" : "Pendiente"}
            sub="estado"
            alert={!informeSocial}
            bordered
          />
        </div>
      </div>
    </header>
  );
}
