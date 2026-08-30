import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { voluntarioProcedure, router } from "../../_core/trpc";
import { createOrReviveEnrollment } from "../programs.enrollmentEstado";
import { estadoInicial } from "../../../shared/programEstados";

export const enrollRouter = router({
  /**
   * Inscribe a una persona en uno o más programas (camino del wizard de alta).
   *
   * Pasa por `createOrReviveEnrollment`, el mismo escritor que usa el modal de
   * la pantalla de programas. Antes hacía su propio `upsert`, y por ahí se
   * colaban dos cosas: inscribía en CONTENEDORES —que por diseño no admiten
   * inscripción (ADR-0013)— y al reutilizar una baja dejaba `motivo_baja`,
   * `fecha_fin` y `deleted_at` intactos, sin dejar rastro en `enrollment_events`.
   */
  enroll: voluntarioProcedure
    .input(z.object({
      personId: z.string().uuid(),
      programIds: z.array(z.string().uuid()),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.programIds.length === 0) return [];

      const supabase = createAdminClient();
      const { data: programas, error } = await supabase
        .from("programs")
        .select("id, name, inscribible, estados_habilitados")
        .in("id", input.programIds);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error al inscribir en programas: ${error.message}`,
          cause: error,
        });
      }

      const noInscribible = (programas ?? []).find((p) => p.inscribible === false);
      if (noInscribible) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `'${noInscribible.name}' no admite inscripciones directas — inscribe en uno de sus programas hijos`,
        });
      }

      const creadas = [];
      for (const programa of programas ?? []) {
        try {
          creadas.push(
            await createOrReviveEnrollment(supabase, String(ctx.user.id), {
              personId: input.personId,
              programId: programa.id,
              estado: estadoInicial(programa.estados_habilitados ?? ["activo"]),
            })
          );
        } catch (err) {
          // Una inscripción que ya está viva no es un fallo del alta: se deja
          // como está y se sigue con el resto. Cualquier otro error sí sube.
          if (err instanceof TRPCError && err.code === "CONFLICT") continue;
          throw err;
        }
      }
      return creadas;
    }),
});
