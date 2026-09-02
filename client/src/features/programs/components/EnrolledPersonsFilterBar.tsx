/**
 * EnrolledPersonsFilterBar — la cabecera de filtros de la tabla de inscritos.
 *
 * Vive fuera de EnrolledPersonsTable por el tope de max-lines (300, ERROR en
 * eslint.config.js:64): con las tasks 2, 7, 10 y 12 la tabla llega a ~289
 * líneas contables y no cabe una barra dentro.
 *
 * Los ejes se aplican EN EL SERVIDOR (programs.getEnrollments): la carga útil
 * de la tabla no trae campos demográficos, así que filtrar en el cliente no
 * es posible.
 *
 * RGPD: aquí NO hay eje de `situacion_legal` («quién tiene papeles»), ni de
 * `colectivos` ni de `recorrido_migratorio`. `situacion_legal` está en
 * HIGH_RISK_PII_FIELDS (shared/reports/entities.ts:289) y vetado en el roster
 * (programs.enlace.ts:241). Queda fuera hasta decisión expresa.
 */
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/features/persons/components/SearchableSelect";
import {
  PAIS_LABELS,
  GENERO_LABELS,
  SITUACION_LABORAL_LABELS,
  SITUACION_ANTE_EMPLEO_LABELS,
} from "@/features/persons/schemas";
import { ESTADO_LABELS } from "@shared/programEstados";
import type { EnrollmentEstado } from "../schemas";
import {
  FILTROS_VACIOS,
  hayFiltrosActivos,
  type FiltrosInscritos,
} from "../utils/enrollmentFiltros";

interface EnrolledPersonsFilterBarProps {
  filtros: FiltrosInscritos;
  onFiltrosChange: (f: FiltrosInscritos) => void;
  /** Chips de estado ya resueltos por la tabla (buildFilterStates). */
  filterStates: EnrollmentEstado[];
}

export function EnrolledPersonsFilterBar({
  filtros,
  onFiltrosChange,
  filterStates,
}: EnrolledPersonsFilterBarProps) {
  const set = <K extends keyof FiltrosInscritos>(clave: K, valor: FiltrosInscritos[K]) =>
    onFiltrosChange({ ...filtros, [clave]: valor });

  return (
    <div className="space-y-3">
      {/* Búsqueda + chips de estado */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <Input
          placeholder="Buscar por nombre..."
          value={filtros.search}
          onChange={(e) => set("search", e.target.value)}
          className="sm:max-w-xs"
          aria-label="Buscar persona inscrita"
        />
        <div className="flex flex-wrap gap-1 items-center" role="group" aria-label="Filtrar por estado">
          <Button
            size="sm"
            variant={filtros.estado === undefined ? "default" : "outline"}
            onClick={() => set("estado", undefined)}
            className="text-xs h-8 rounded-full"
          >
            Todos
          </Button>
          {filterStates.map((e) => (
            <Button
              key={e}
              size="sm"
              variant={filtros.estado === e ? "default" : "outline"}
              onClick={() => set("estado", e)}
              className="text-xs h-8 rounded-full"
            >
              {ESTADO_LABELS[e as keyof typeof ESTADO_LABELS] ?? e}
            </Button>
          ))}
          {hayFiltrosActivos(filtros) && (
            <button
              type="button"
              onClick={() => onFiltrosChange(FILTROS_VACIOS)}
              className="ml-2 text-xs text-muted-foreground underline decoration-dotted hover:text-foreground transition-colors"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* Ejes — se aplican en el servidor */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <SearchableSelect
          label="País de origen"
          id="filtro-inscritos-pais"
          value={filtros.pais_origen}
          onChange={(v) => set("pais_origen", v)}
          options={PAIS_LABELS}
          placeholder="Todos los países"
          searchPlaceholder="Escribe el país..."
        />
        <SearchableSelect
          label="Género"
          id="filtro-inscritos-genero"
          value={filtros.genero}
          onChange={(v) => set("genero", v as FiltrosInscritos["genero"])}
          options={GENERO_LABELS}
          placeholder="Todos"
        />
        <SearchableSelect
          label="Situación laboral"
          id="filtro-inscritos-situacion-laboral"
          value={filtros.situacion_laboral}
          onChange={(v) => set("situacion_laboral", v as FiltrosInscritos["situacion_laboral"])}
          options={SITUACION_LABORAL_LABELS}
          placeholder="Todas"
        />
        <SearchableSelect
          label="Situación ante el empleo"
          id="filtro-inscritos-situacion-empleo"
          value={filtros.situacion_ante_empleo}
          onChange={(v) =>
            set("situacion_ante_empleo", v as FiltrosInscritos["situacion_ante_empleo"])
          }
          options={SITUACION_ANTE_EMPLEO_LABELS}
          placeholder="Todas"
        />
      </div>
    </div>
  );
}
