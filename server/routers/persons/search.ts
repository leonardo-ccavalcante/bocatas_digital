/**
 * persons.search — búsqueda manual de personas.
 *
 * Dos carriles que se unen al final:
 *
 *   1. NOMBRE — un `ilike` por cada palabra normalizada contra la columna
 *      generada `nombre_norm` (`nombre || ' ' || apellidos` sin acentos), así
 *      que buscar por apellido, por nombre, o por los dos en cualquier orden
 *      funciona igual. (RC-06)
 *   2. IDENTIFICADOR — `numero_documento` y `telefono`, sólo cuando lo tecleado
 *      lleva al menos tres dígitos seguidos. Sin esa condición cada búsqueda
 *      por nombre barrería además dos columnas para nada.
 *
 * Son dos consultas y no un único `.or(...)` porque el carril de nombre es un
 * AND de N `ilike` y el de identificador un OR de dos: mezclarlos en un solo
 * árbol de filtros de PostgREST obliga a construir a mano un `or(and(...),...)`
 * con las comillas y los escapes anidados del valor del usuario dentro. Dos
 * consultas indexadas caben de sobra en el presupuesto de 2 s de la búsqueda
 * manual y dejan la superficie de inyección en cero.
 *
 * LÍMITE CONOCIDO: la comparación es de subcadena literal, así que un teléfono
 * guardado con espacios o prefijo no lo encuentra quien teclea sólo los dígitos.
 * En los datos reales eso es una minoría pequeña; normalizarlo de verdad exige
 * una columna generada (otra migración), y hoy hay migraciones sin aplicar en
 * producción — se deja documentado en lugar de añadir una más.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { voluntarioProcedure } from "../../_core/trpc";
import { signPathField, AVATAR_BUCKET } from "../../storage";
import { ilikeValue, ilikeForOr } from "../../_core/postgrestFilter";
import { nameSearchTokens } from "../../../shared/nameSearch";

const SEARCH_COLUMNS =
  "id, nombre, apellidos, fecha_nacimiento, foto_perfil_url, restricciones_alimentarias, fase_itinerario";

const SEARCH_LIMIT = 20;

/** Al menos tres dígitos seguidos: un DNI, un NIE, un pasaporte o un teléfono. */
const PARECE_IDENTIFICADOR = /\d{3,}/;

interface PersonSearchRow {
  id: string;
  nombre: string;
  apellidos: string | null;
  fecha_nacimiento: string | null;
  foto_perfil_url: string | null;
  restricciones_alimentarias: string | null;
  fase_itinerario: string | null;
}

/**
 * El mensaje de Postgres puede llevar dentro el valor buscado — que es un
 * número de documento o un teléfono. Nunca sale hacia el cliente. (AGENTS.md:
 * sin PII en errores.)
 */
function errorDeBusqueda(): TRPCError {
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Error en búsqueda",
  });
}

async function buscarPorNombre(consulta: string): Promise<PersonSearchRow[]> {
  const tokens = nameSearchTokens(consulta);
  if (tokens.length === 0) return [];
  const supabase = createAdminClient();
  let q = supabase.from("persons").select(SEARCH_COLUMNS).is("deleted_at", null);
  for (const tok of tokens) {
    q = q.ilike("nombre_norm", ilikeValue(tok));
  }
  const { data, error } = await q.order("nombre").limit(SEARCH_LIMIT);
  if (error) throw errorDeBusqueda();
  return (data ?? []) as PersonSearchRow[];
}

async function buscarPorIdentificador(consulta: string): Promise<PersonSearchRow[]> {
  if (!PARECE_IDENTIFICADOR.test(consulta)) return [];
  const supabase = createAdminClient();
  // ilikeForOr entrecomilla y escapa: sin eso una coma en lo tecleado añade
  // filtros al árbol de PostgREST y ensancha el resultado (CAS-04).
  const patron = ilikeForOr(consulta);
  const { data, error } = await supabase
    .from("persons")
    .select(SEARCH_COLUMNS)
    .is("deleted_at", null)
    .or(`numero_documento.ilike.${patron},telefono.ilike.${patron}`)
    .order("nombre")
    .limit(SEARCH_LIMIT);
  if (error) throw errorDeBusqueda();
  return (data ?? []) as PersonSearchRow[];
}

/**
 * Une los dos carriles sin repetir personas y deja el orden alfabético que
 * espera la lista. `numero_documento` y `telefono` se usan para BUSCAR pero no
 * se devuelven: minimización de datos.
 */
export function unirResultados(
  porNombre: PersonSearchRow[],
  porIdentificador: PersonSearchRow[]
): PersonSearchRow[] {
  const porId = new Map<string, PersonSearchRow>();
  for (const fila of [...porNombre, ...porIdentificador]) {
    porId.set(fila.id, fila);
  }
  return [...porId.values()]
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
    .slice(0, SEARCH_LIMIT);
}

export const searchPersons = voluntarioProcedure
  .input(z.object({ query: z.string().min(2).max(100) }))
  .query(async ({ input }) => {
    const consulta = input.query.trim();
    if (consulta.length === 0) return [];

    const [porNombre, porIdentificador] = await Promise.all([
      buscarPorNombre(consulta),
      buscarPorIdentificador(consulta),
    ]);

    const filas = unirResultados(porNombre, porIdentificador);
    // Una sola llamada a Storage para toda la página, nunca una por fila: esto
    // alimenta la búsqueda manual "Sin QR", con presupuesto de menos de 2 s.
    await signPathField(AVATAR_BUCKET, filas, "foto_perfil_url");
    return filas;
  });
