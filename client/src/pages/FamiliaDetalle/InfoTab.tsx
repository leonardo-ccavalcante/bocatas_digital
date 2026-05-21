/**
 * InfoTab — "Información" tab content for the familia ficha.
 *
 * Visuals ported from the v4 prototype (familias.jsx · ResumenSection +
 * MiembrosSection): titular card, household composition card, and the members
 * roster. All data is REAL (passed from families.getById) — no fabrication.
 */
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import type { Titular } from "./types";

interface Miembro {
  nombre?: string;
  apellidos?: string;
  fecha_nacimiento?: string;
  parentesco?: string;
}

interface InfoTabProps {
  titular: Titular | null;
  numAdultos: number;
  numMenores: number;
  miembros: Miembro[];
  autorizado: boolean;
  personaRecoge: string | null;
  onManageMembers: () => void;
}

function initials(nombre: string): string {
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function InfoTab({
  titular,
  numAdultos,
  numMenores,
  miembros,
  autorizado,
  personaRecoge,
  onManageMembers,
}: InfoTabProps) {
  const total = numAdultos + numMenores;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {/* Titular */}
        <div className="bocatas-card p-5">
          <h2 className="text-eyebrow mb-3 text-muted-foreground">Titular</h2>
          {titular ? (
            <dl className="space-y-1.5 text-body-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Nombre</dt>
                <dd className="text-right font-medium text-foreground">
                  {titular.nombre} {titular.apellidos ?? ""}
                </dd>
              </div>
              {titular.telefono && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Teléfono</dt>
                  <dd className="text-right text-foreground">{titular.telefono}</dd>
                </div>
              )}
              {titular.fecha_nacimiento && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Nacimiento</dt>
                  <dd className="text-right text-foreground">
                    {new Date(titular.fecha_nacimiento).toLocaleDateString("es-ES")}
                  </dd>
                </div>
              )}
              <Link href={`/personas/${titular.id}`} className="mt-1 inline-block">
                <Button variant="link" size="sm" className="h-auto px-0">
                  Ver ficha completa →
                </Button>
              </Link>
            </dl>
          ) : (
            <p className="text-body-sm text-muted-foreground">
              Sin datos del titular
            </p>
          )}
        </div>

        {/* Composición */}
        <div className="bocatas-card p-5">
          <h2 className="text-eyebrow mb-3 text-muted-foreground">
            Composición del hogar
          </h2>
          <dl className="space-y-2 text-body-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Adultos</dt>
              <dd className="tabular-stat text-foreground">{numAdultos}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Menores</dt>
              <dd className="tabular-stat text-foreground">{numMenores}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-2 font-medium">
              <dt className="text-foreground">Total miembros</dt>
              <dd className="tabular-stat text-foreground">{total}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Members roster */}
      <div className="bocatas-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-h3 text-foreground">Miembros de la familia</h2>
          <Button size="sm" onClick={onManageMembers}>
            Gestionar miembros
          </Button>
        </div>
        {miembros.length > 0 ? (
          <ul className="divide-y divide-border">
            {miembros.map((m, idx) => (
              // key={idx}: miembros is JSONB-derived; no stable id exists in this shape
              <li key={idx} className="flex items-center gap-3 px-5 py-3">
                <span className="bg-accent text-accent-foreground inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                  {initials(`${m.nombre ?? ""}`)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-body-sm font-medium text-foreground">
                    {m.nombre} {m.apellidos ?? ""}
                  </p>
                  {m.fecha_nacimiento && (
                    <p className="text-xs text-muted-foreground">
                      Nac:{" "}
                      {new Date(m.fecha_nacimiento).toLocaleDateString("es-ES")}
                    </p>
                  )}
                </div>
                {m.parentesco && (
                  <span className="text-xs text-muted-foreground">
                    {m.parentesco}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-8 text-center text-body-sm text-muted-foreground">
            No hay miembros registrados. Usa el botón de arriba para añadirlos.
          </p>
        )}
      </div>

      {/* Authorized pickup person */}
      {autorizado && (
        <div className="bocatas-card p-5">
          <h2 className="text-eyebrow mb-2 text-muted-foreground">
            Persona autorizada
          </h2>
          <p className="text-body-sm text-foreground">
            {personaRecoge?.trim() ? personaRecoge : "No especificada"}
          </p>
        </div>
      )}
    </div>
  );
}
