/**
 * enrollmentFiltros.ts — el estado de la cabecera de filtros de la tabla de
 * inscritos y su traducción al input de `programs.getEnrollments`.
 *
 * `FILTROS_VACIOS.estado` es `undefined` («Todos») a propósito. El defecto
 * anterior era 'activo' y en producción el curso 2026_09_coc (Cocina, 23
 * inscritos) no tiene 'activo' entre sus `estados_habilitados`: la tabla
 * pedía un estado que ese curso no usa y la pantalla decía «0 personas
 * inscritas (activos)».
 */
import type { z } from "zod";
import type {
  GeneroSchema,
  SituacionLaboralSchema,
  SituacionAnteEmpleoSchema,
} from "@/features/persons/schemas";
import type { EnrollmentEstado } from "../schemas";

type Genero = z.infer<typeof GeneroSchema>;
type SituacionLaboral = z.infer<typeof SituacionLaboralSchema>;
type SituacionAnteEmpleo = z.infer<typeof SituacionAnteEmpleoSchema>;

/** "" es «sin filtro» en la UI: es lo que devuelve SearchableSelect al deseleccionar. */
export interface FiltrosInscritos {
  search: string;
  estado: EnrollmentEstado | undefined;
  /** ISO 3166-1 alpha-2, como la columna `persons.pais_origen`. */
  pais_origen: string;
  genero: Genero | "";
  situacion_laboral: SituacionLaboral | "";
  situacion_ante_empleo: SituacionAnteEmpleo | "";
}

export const FILTROS_VACIOS: FiltrosInscritos = {
  search: "",
  estado: undefined,
  pais_origen: "",
  genero: "",
  situacion_laboral: "",
  situacion_ante_empleo: "",
};

/** Los ejes seguros. `situacion_legal`, `colectivos` y `recorrido_migratorio`
 *  quedan FUERA: alto riesgo (shared/reports/entities.ts:289) / Art. 9-10. */
export const EJES_FILTRO = [
  "pais_origen",
  "genero",
  "situacion_laboral",
  "situacion_ante_empleo",
] as const;

export function hayFiltrosActivos(f: FiltrosInscritos): boolean {
  return (
    f.search.length > 0 ||
    f.estado !== undefined ||
    EJES_FILTRO.some((eje) => f[eje] !== "")
  );
}

/**
 * Traduce la barra al input del router: "" → `undefined`. La búsqueda de
 * menos de 2 caracteres no viaja (sería un `ilike '%a%'` sobre la tabla
 * entera en cada tecla) — es la regla que ya tenía la tabla.
 */
export function aInputServidor(f: FiltrosInscritos) {
  const search = f.search.trim();
  return {
    estado: f.estado,
    search: search.length >= 2 ? search : undefined,
    pais_origen: f.pais_origen || undefined,
    genero: f.genero || undefined,
    situacion_laboral: f.situacion_laboral || undefined,
    situacion_ante_empleo: f.situacion_ante_empleo || undefined,
  };
}

export type FiltrosServidor = ReturnType<typeof aInputServidor>;
