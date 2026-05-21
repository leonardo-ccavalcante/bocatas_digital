/**
 * ResumenTab — the persona summary, restyled to the v4 prototype's card grid.
 *
 * Renders ONLY real `persons` row fields (contact, documento, situación,
 * social, estado actual). High-risk `situacion_legal` is admin-gated, matching
 * the RLS guarantee in CLAUDE.md §3. No fabricated data.
 */
import { formatDateDisplay } from "@/lib/dateUtils";
import type { Database } from "@/lib/database.types";
import { getEstadoChip } from "./personaEstado";

type PersonRow = Database["public"]["Tables"]["persons"]["Row"];

interface ResumenTabProps {
  person: PersonRow;
  isAdmin: boolean;
}

function DetailCard({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`bocatas-card ${className ?? ""}`}>
      <header className="border-b border-border px-5 py-3">
        <p className="text-eyebrow text-muted-foreground">{title}</p>
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function DataGrid({ items }: { items: Array<[string, string | null | undefined]> }) {
  const visible = items.filter(([, v]) => v != null && v !== "");
  if (visible.length === 0) {
    return <p className="text-body-sm text-muted-foreground">Sin datos registrados.</p>;
  }
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-body-sm sm:grid-cols-2">
      {visible.map(([k, v]) => (
        <div
          key={k}
          className="flex items-baseline justify-between gap-3 border-b border-border pb-2.5"
        >
          <dt className="text-xs text-muted-foreground">{k}</dt>
          <dd className="truncate text-right font-medium text-foreground">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function EstadoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <li className="flex items-center justify-between py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </li>
  );
}

export function ResumenTab({ person, isAdmin }: ResumenTabProps) {
  const estado = getEstadoChip(person.fase_itinerario);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <DetailCard title="Datos de contacto" className="lg:col-span-2">
        <DataGrid
          items={[
            ["Teléfono", person.telefono],
            ["Email", person.email],
            ["Dirección", person.direccion],
            ["Municipio", person.municipio],
            ["Barrio / Zona", person.barrio_zona],
            ["Nacionalidad", person.pais_origen],
            ["Fecha nac.", formatDateDisplay(person.fecha_nacimiento)],
            ["Documento", person.numero_documento],
          ]}
        />
      </DetailCard>

      <DetailCard title="Estado actual">
        <ul className="divide-y divide-border text-body-sm">
          <EstadoRow label="Fase" value={estado.label} />
          <EstadoRow
            label="Tipo documento"
            value={person.tipo_documento}
          />
          <EstadoRow
            label="Llegada a España"
            value={formatDateDisplay(person.fecha_llegada_espana)}
          />
          {isAdmin && (
            <EstadoRow label="Situación legal" value={person.situacion_legal} />
          )}
        </ul>
      </DetailCard>

      <DetailCard title="Situación socioeconómica" className="lg:col-span-2">
        <DataGrid
          items={[
            ["Tipo de vivienda", person.tipo_vivienda],
            ["Nivel de estudios", person.nivel_estudios],
            ["Situación laboral", person.situacion_laboral],
            ["Nivel de ingresos", person.nivel_ingresos],
          ]}
        />
      </DetailCard>

      <DetailCard title="Información social">
        <div className="space-y-3 text-body-sm">
          {person.necesidades_principales ? (
            <div>
              <p className="text-xs text-muted-foreground">Necesidades principales</p>
              <p className="text-foreground">{person.necesidades_principales}</p>
            </div>
          ) : null}
          {person.restricciones_alimentarias ? (
            <div>
              <p className="text-xs text-muted-foreground">Restricciones alimentarias</p>
              <p className="text-foreground">{person.restricciones_alimentarias}</p>
            </div>
          ) : null}
          {!person.necesidades_principales && !person.restricciones_alimentarias && (
            <p className="text-muted-foreground">Sin información social registrada.</p>
          )}
        </div>
      </DetailCard>
    </div>
  );
}
