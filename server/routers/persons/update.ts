/**
 * persons.update / persons.softDelete — corregir y retirar fichas (#177).
 *
 * Hasta ahora el alta era la ÚNICA ventana de captura: un apellido mal escrito
 * se quedaba así para siempre, y el propio wizard prometía «Podrás editar
 * después», que era falso. Tampoco había forma de retirar una ficha duplicada.
 *
 * POLÍTICA DE ACCESO (las tres decisiones que #177 dejaba abiertas)
 * ----------------------------------------------------------------
 * 1. QUÉ se puede editar: todos los campos del alta MENOS
 *    - `program_ids`, que no es una columna de persons (va por persons.enroll);
 *    - `fase_itinerario`, que ya tiene su procedimiento (updateFaseItinerario) —
 *      dos escritores para el mismo campo es justo lo que no queremos.
 *
 * 2. QUIÉN edita: `adminProcedure` (admin + superadmin), que es EXACTAMENTE la
 *    misma frontera que la de lectura de los campos de alto riesgo
 *    (`redactHighRiskFields`: situacion_legal, foto_documento_url,
 *    recorrido_migratorio, colectivos…). Así nadie puede escribir un campo que
 *    no puede leer, que era el riesgo que señalaba #177. Un voluntario no puede
 *    ni abrir la ficha (`getById` es adminProcedure), así que no hay un carril
 *    intermedio que inventar.
 *    Retirar una ficha es `superadminProcedure`: borrar no es corregir.
 *
 * 3. RASTRO: se registra por `logProcedureAction` con el id de la persona y la
 *    LISTA DE CAMPOS tocados — nunca sus valores, que son PII. La auditoría
 *    completa depende de #150 (logAudit escribe en un buffer que nadie lee) y
 *    no se resuelve aquí.
 *
 * Los datos de categoría especial (Art. 9/10) no se pueden tocar sin declarar
 * el consentimiento: ver `colectivo_consentimiento` más abajo.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { adminProcedure, superadminProcedure } from "../../_core/trpc";
import { logProcedureAction, logProcedureError } from "../../_core/logging-middleware";
import { encryptPII, isPiiCryptoConfigured } from "../../_core/pii-crypto";
import { softDeleteWithCascade } from "../../db/soft-delete-cascade";
import type { Database } from "../../../client/src/lib/database.types";
import { PersonCreateInput, uuidLike } from "./_shared";

type PersonsUpdate = Database["public"]["Tables"]["persons"]["Update"];

/**
 * Parche parcial: lo ausente NO se toca, y `null` (o "") limpia el campo.
 * `.partial()` sobre el esquema del alta mantiene una sola fuente de verdad
 * para los tipos y los límites de longitud (ADR-0001).
 */
export const PersonUpdateFields = PersonCreateInput.omit({
  program_ids: true,
  fase_itinerario: true,
  // Desde que getById dejó de devolverlo, un admin podría escribir un campo
  // que ya no puede leer — justo el invariante que la cabecera de este archivo
  // afirma. Se cambia volviendo a subir la foto, no parcheando la columna.
  foto_documento_url: true,
}).partial();

/** Campos de categoría especial: sólo se escriben con consentimiento declarado. */
const CAMPOS_ART9 = ["colectivos", "colectivo_otros"] as const;

const str = (v: string | null | undefined): string | null =>
  v === "" || v === undefined ? null : v;

type Parche = z.infer<typeof PersonUpdateFields>;

/**
 * Convierte el parche en el payload del UPDATE, incluyendo SOLO las claves que
 * el cliente mandó. Sin esto, un `.partial()` con `undefined` en el resto
 * machacaría a null media ficha.
 */
export function construirPayload(parche: Parche): PersonsUpdate {
  const { colectivo_consentimiento, ...campos } = parche;
  void colectivo_consentimiento; // transitorio, no es columna
  const payload: Record<string, unknown> = {};

  for (const [clave, valor] of Object.entries(campos)) {
    if (valor === undefined) continue;
    if (clave === "colectivo_otros") {
      const texto = str(valor as string | null);
      // Vaciar el campo es legítimo y no necesita clave.
      // Con texto, `encryptPII` cifra o lanza: nunca se guarda en claro.
      //
      // Antes esta rama escribía `null` cuando faltaba la clave, contra lo que
      // decía su propio comentario. En un INSERT eso sólo significa "no se
      // guarda"; aquí es un UPDATE, así que BORRABA el dato de categoría
      // especial que ya estuviera cifrado en la ficha. El resolver rechaza
      // antes ese caso (ver updatePerson), y aquí nunca se asigna null salvo
      // que se pida vaciar.
      payload[clave] = texto === null ? null : encryptPII(texto);
      continue;
    }
    payload[clave] = typeof valor === "string" ? str(valor) : valor;
  }
  // Las claves salen de PersonUpdateFields, que es PersonCreateInput y por tanto
  // ya sólo contiene columnas de `persons`; el cast estrecha lo construido
  // dinámicamente a la forma que espera supabase-js.
  return payload as PersonsUpdate;
}

export const updatePerson = adminProcedure
  .input(z.object({ id: uuidLike, data: PersonUpdateFields }))
  .mutation(async ({ ctx, input }) => {
    const tocaArt9 = CAMPOS_ART9.some((c) => input.data[c] !== undefined);
    if (tocaArt9 && input.data.colectivo_consentimiento !== true) {
      // Ni escribir a ciegas ni borrar en silencio lo ya consentido: se exige
      // que quien edita declare el consentimiento explícito (Art. 9(2)(a)).
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Para modificar los datos de colectivo hace falta declarar el consentimiento explícito de la persona.",
      });
    }

    // Fail-closed y RUIDOSO: sin clave de cifrado no se puede guardar texto de
    // categoría especial, y tampoco se puede fingir que se guardó. Vaciar el
    // campo sí se permite (no necesita clave).
    const textoColectivo = input.data.colectivo_otros;
    if (
      textoColectivo !== undefined &&
      textoColectivo !== null &&
      textoColectivo !== "" &&
      !isPiiCryptoConfigured()
    ) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "No se puede guardar el texto de colectivo: falta la clave de cifrado en el servidor.",
      });
    }

    const payload = construirPayload(input.data);
    if (Object.keys(payload).length === 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "No hay cambios que guardar." });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("persons")
      .update(payload)
      .eq("id", input.id)
      .is("deleted_at", null)
      .select("id, nombre, apellidos")
      .maybeSingle();

    if (error) {
      logProcedureError(ctx, "Failed to update person", error as Error, {
        personId: input.id,
      });
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Error al guardar los cambios.",
      });
    }
    if (!data) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Persona no encontrada." });
    }

    // Sólo los NOMBRES de los campos: los valores son PII (AGENTS.md).
    logProcedureAction(ctx, "Person updated", {
      personId: input.id,
      campos: Object.keys(payload),
    });
    return data;
  });

export const softDeletePerson = superadminProcedure
  .input(z.object({ id: uuidLike }))
  .mutation(async ({ ctx, input }) => {
    const supabase = createAdminClient();

    const { data: persona, error: errorLectura } = await supabase
      .from("persons")
      .select("id, nombre, apellidos")
      .eq("id", input.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (errorLectura) {
      logProcedureError(ctx, "Failed to read person before delete", errorLectura as Error, {
        personId: input.id,
      });
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Error al retirar la ficha." });
    }
    if (!persona) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Persona no encontrada." });
    }

    // Una persona con asistencias registradas es historia de servicio: retirarla
    // dejaría check-ins colgando de una ficha invisible. Los duplicados que hay
    // que limpiar no tienen ninguna.
    const { count, error: errorConteo } = await supabase
      .from("attendances")
      .select("id", { count: "exact", head: true })
      .eq("person_id", input.id);

    // La guarda tiene que fallar CERRADA. Descartando el error, un timeout en
    // `attendances` devolvía count=null, `(count ?? 0) > 0` daba false, y la
    // ficha se retiraba con todo su historial de servicio colgando — justo el
    // caso que esta comprobación existe para impedir, y sin dejar rastro.
    if (errorConteo || count === null) {
      logProcedureError(
        ctx,
        "Failed to count attendances before delete",
        (errorConteo ?? new Error("count nulo")) as Error,
        { personId: input.id }
      );
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "No se pudo comprobar el historial de la ficha. No se ha retirado nada.",
      });
    }

    if (count > 0) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `No se puede retirar: la ficha tiene ${count} check-in(s) registrados. Revisa si en realidad hay que fusionarla con otra.`,
      });
    }

    // Marca deleted_at en persons y arrastra sus inscripciones
    // (server/db/soft-delete-cascade.ts). Reversible: admin/soft-delete-recovery.
    await softDeleteWithCascade(supabase, "persons", input.id);

    logProcedureAction(ctx, "Person soft-deleted", { personId: input.id });
    return { id: persona.id };
  });
