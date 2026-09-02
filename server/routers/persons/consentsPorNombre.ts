/**
 * consentsPorNombre.ts — «tengo 7 nombres para un cartel, ¿puedo publicar
 * sus caras?».
 *
 * Comprueba en bloque, desde una lista pegada, quién tiene VIGENTE un fin de
 * consentimiento. Resuelve contra `persons.nombre_norm`, la columna GENERADA
 * f_unaccent(lower(coalesce(nombre,'') || ' ' || coalesce(apellidos,'')))
 * (migración 20260830100001), con la MISMA normalización que ya usa la
 * búsqueda manual — `nameSearchTokens` de shared/nameSearch.ts. Escribir una
 * segunda normalización aquí sería la forma más rápida de que un día dejen de
 * coincidir.
 *
 * Regla dura: un nombre que casa con DOS personas no se adivina. Sale en
 * `ambiguos` con el número de coincidencias para que decida una persona;
 * quedarse con la primera fila publicaría la cara de quien dijo que no.
 *
 * adminProcedure: la respuesta dice quién está en la base y qué ha consentido.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { adminProcedure, router } from "../../_core/trpc";
import { nameSearchTokens } from "../../../shared/nameSearch";

/** Espejo del enum `consent_purpose` (mismo catálogo que saveConsents). */
const PURPOSES = [
  "tratamiento_datos_bocatas",
  "tratamiento_datos_banco_alimentos",
  "compartir_datos_red",
  "comunicaciones_whatsapp",
  "fotografia",
  "archivo_documento_identidad",
] as const;

type Purpose = (typeof PURPOSES)[number];
type Supabase = ReturnType<typeof createAdminClient>;

interface PersonaCotejada {
  id: string;
  nombre: string;
}

/** Normaliza como la columna generada y colapsa los espacios de más. */
export function normalizarNombreParaCotejo(texto: string): string {
  return nameSearchTokens(texto).join(" ");
}

export const consentsPorNombreRouter = router({
  checkConsentByNames: adminProcedure
    .input(
      z.object({
        names: z.array(z.string().min(1)).min(1).max(100),
        purpose: z.enum(PURPOSES).default("fotografia"),
      })
    )
    .query(async ({ input }) => {
      const supabase = createAdminClient();

      // Se conserva el texto tal cual lo pegaron para poder devolverlo en
      // `no_encontrados` / `ambiguos`: quien comprueba busca SU línea.
      const entradas: Array<{ raw: string; norm: string }> = [];
      const vacios: string[] = [];
      const vistos = new Set<string>();
      for (const raw of input.names) {
        const norm = normalizarNombreParaCotejo(raw);
        if (!norm) {
          vacios.push(raw);
          continue;
        }
        if (vistos.has(norm)) continue;
        vistos.add(norm);
        entradas.push({ raw, norm });
      }

      // `nombre_norm` de quien no tiene apellidos acaba en espacio (el
      // coalesce concatena '' detrás del separador), así que se pregunta por
      // las dos formas y las filas se cotejan ya normalizadas.
      const claves = [...new Set(entradas.flatMap((e) => [e.norm, `${e.norm} `]))];

      const porNorm = new Map<string, PersonaCotejada[]>();
      if (claves.length > 0) {
        const { data, error } = await supabase
          .from("persons")
          .select("id, nombre, apellidos, nombre_norm")
          .in("nombre_norm", claves)
          .is("deleted_at", null);

        if (error) {
          // El mensaje del driver arrastra los nombres buscados: fuera. El
          // `cause` viaja al log correlacionado (sólo códigos, sin PII).
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "No se pudo comprobar la lista de nombres",
            cause: error,
          });
        }

        for (const p of data ?? []) {
          const clave = normalizarNombreParaCotejo(String(p.nombre_norm ?? ""));
          const lista = porNorm.get(clave) ?? [];
          lista.push({
            id: String(p.id),
            nombre: `${p.nombre ?? ""} ${p.apellidos ?? ""}`.trim(),
          });
          porNorm.set(clave, lista);
        }
      }

      const idsUnicos = entradas
        .map((e) => porNorm.get(e.norm) ?? [])
        .filter((filas) => filas.length === 1)
        .map((filas) => filas[0].id);

      const vigentes = await idsConFinVigente(supabase, idsUnicos, input.purpose);

      const con_consentimiento: PersonaCotejada[] = [];
      const sin_consentimiento: PersonaCotejada[] = [];
      const no_encontrados: string[] = [...vacios];
      const ambiguos: Array<{ input: string; matches: number }> = [];

      for (const { raw, norm } of entradas) {
        const filas = porNorm.get(norm) ?? [];
        if (filas.length === 0) {
          no_encontrados.push(raw);
        } else if (filas.length > 1) {
          ambiguos.push({ input: raw, matches: filas.length });
        } else if (vigentes.has(filas[0].id)) {
          con_consentimiento.push(filas[0]);
        } else {
          sin_consentimiento.push(filas[0]);
        }
      }

      return { con_consentimiento, sin_consentimiento, no_encontrados, ambiguos };
    }),
});

/**
 * Ids con el fin CONCEDIDO y NO retirado. Una revocación cuenta como un «no»:
 * `revoked_at` se escribe de verdad desde saveConsents, así que filtrarlo es
 * la diferencia entre respetar una retirada y publicar igualmente.
 */
async function idsConFinVigente(
  supabase: Supabase,
  personIds: string[],
  purpose: Purpose
): Promise<Set<string>> {
  if (personIds.length === 0) return new Set();

  const { data, error } = await supabase
    .from("consents")
    .select("person_id")
    .in("person_id", personIds)
    .eq("purpose", purpose)
    .eq("granted", true)
    .is("revoked_at", null)
    .is("deleted_at", null);

  if (error) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "No se pudieron leer los consentimientos",
      cause: error,
    });
  }

  return new Set((data ?? []).map((r) => String(r.person_id)));
}
