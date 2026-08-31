/**
 * ResumenTab — the persona summary, restyled to the v4 prototype's card grid.
 *
 * Renders ONLY real `persons` row fields (contact, documento, situación,
 * social, estado actual). High-risk `situacion_legal` is admin-gated, matching
 * the RLS guarantee in CLAUDE.md §3. No fabricated data.
 */
import { Pencil } from "lucide-react";
import { formatDateDisplay } from "@/lib/dateUtils";
import type { Database } from "@/lib/database.types";
import {
  NIVEL_ESTUDIOS_LABELS,
  NIVEL_INGRESOS_LABELS,
  SITUACION_LABORAL_LABELS,
  SITUACION_LEGAL_LABELS,
  TIPO_VIVIENDA_LABELS,
} from "../../schemas";
import { getEstadoChip } from "./personaEstado";
import type { SeccionEditable } from "./EditPersonModal";

// Los mapas de `schemas/labels.ts` son la lista de opciones DEL FORMULARIO. La
// ficha además tiene que saber leer los valores que se retiraron del
// formulario pero siguen guardados en registros antiguos; de ahí las entradas
// extra. Sin esto la ficha mostraba la cadena cruda (`sin_permiso_trabajo`).
const VIVIENDA_TEXTO: Record<string, string> = {
  ...Object.fromEntries(Object.entries(TIPO_VIVIENDA_LABELS).map(([k, v]) => [k, v.label])),
  centro_acogida: "Centro de acogida",
};
const ESTUDIOS_TEXTO: Record<string, string> = {
  ...NIVEL_ESTUDIOS_LABELS,
  bachillerato: "Bachillerato",
  formacion_profesional: "Formación Profesional",
  universitario: "Universitario",
  postgrado: "Postgrado",
};
const LEGAL_TEXTO: Record<string, string> = {
  ...SITUACION_LEGAL_LABELS,
  sin_papeles: "Sin papeles",
};

function etiqueta(mapa: Record<string, string>, valor: string | null): string | null {
  if (!valor) return valor;
  return mapa[valor] ?? valor;
}

type PersonRow = Database["public"]["Tables"]["persons"]["Row"];

interface ResumenTabProps {
  person: PersonRow;
  isAdmin: boolean;
  /** Abre el editor ya colocado en esa sección. Ausente = sin lápices. */
  onEditar?: (seccion: SeccionEditable) => void;
}

/**
 * Editar donde se lee.
 *
 * El lápiz de cada bloque abre EL MISMO modal, ya desplazado a la sección
 * correspondiente: un solo escritor, varios puntos de entrada. Sin esto, quien
 * ve mal la nacionalidad tiene que subir a la barra, abrir un formulario de
 * ocho bloques y buscar el campo.
 */
function DetailCard({
  title,
  className,
  onEditar,
  children,
}: {
  title: string;
  className?: string;
  onEditar?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className={`bocatas-card ${className ?? ""}`}>
      <header className="flex items-center justify-between gap-2 border-b border-border px-5 py-3">
        <p className="text-eyebrow text-muted-foreground">{title}</p>
        {onEditar && (
          <button
            type="button"
            onClick={onEditar}
            aria-label={`Editar ${title.toLowerCase()}`}
            title={`Editar ${title.toLowerCase()}`}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
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

export function ResumenTab({ person, isAdmin, onEditar }: ResumenTabProps) {
  const estado = getEstadoChip(person.fase_itinerario);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <DetailCard
        title="Datos de contacto"
        className="lg:col-span-2"
        onEditar={onEditar && (() => onEditar("contacto"))}
      >
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
            <EstadoRow
              label="Situación legal"
              value={etiqueta(LEGAL_TEXTO, person.situacion_legal)}
            />
          )}
        </ul>
      </DetailCard>

      <DetailCard
        title="Situación socioeconómica"
        className="lg:col-span-2"
        onEditar={onEditar && (() => onEditar("situacion"))}
      >
        <DataGrid
          items={[
            ["Tipo de vivienda", etiqueta(VIVIENDA_TEXTO, person.tipo_vivienda)],
            ["Nivel de estudios", etiqueta(ESTUDIOS_TEXTO, person.nivel_estudios)],
            ["Situación laboral", etiqueta(SITUACION_LABORAL_LABELS, person.situacion_laboral)],
            ["Nivel de ingresos", etiqueta(NIVEL_INGRESOS_LABELS, person.nivel_ingresos)],
          ]}
        />
      </DetailCard>

      <DetailCard title="Información social" onEditar={onEditar && (() => onEditar("social"))}>
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
