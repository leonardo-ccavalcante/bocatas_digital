import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import type { Json } from "../../../client/src/lib/database.types";
import { buildRoundActa } from "./reparto-helpers";

interface SignedActaEntry { url: string; by: string; at: string }

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

function fail(error: { message: string } | null): never {
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error?.message ?? "DB error" });
}

export const roundsDocumentsRouter = router({
  // Round-scoped Hoja de Firmas — the COMPLETE roster of every family in the
  // round, ordered by numeric familia_numero. Serves BOTH printable actas:
  //   · Citación (antes): fecha1 + fecha2 (the up-to-2 agreed dates)
  //   · Final (después):  fecha_real (the day the family actually picked up)
  // ADMIN only — carries DNI/NIE (Banco de Alimentos legal basis); never logged.
  getRoundActa: adminProcedure
    .input(z.object({ round_id: uuid }))
    .query(async ({ input }) => {
      const db = createAdminClient();
      return buildRoundActa(db, input.round_id);
    }),

  // Record the photographed SIGNED Hoja de Firmas for a SLOT (round, day, turno).
  // Photo bytes live in the private `family-documents` bucket (client uploads and
  // passes the path); here we store only path + audit (who/when) on the slot.
  attachSignedActa: adminProcedure
    .input(z.object({ round_id: uuid, slot_id: uuid, documento_url: z.string().min(1).max(500) }))
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();
      const { data: slot, error: se } = await db
        .from("delivery_round_slots")
        .select("id, round_id")
        .eq("id", input.slot_id)
        .eq("round_id", input.round_id)
        .single();
      if (se || !slot) throw new TRPCError({ code: "NOT_FOUND", message: "Turno no encontrado" });

      const entry: SignedActaEntry = { url: input.documento_url, by: String(ctx.user.id), at: new Date().toISOString() };
      const { error } = await db
        .from("delivery_round_slots")
        .update({ signed_acta: entry as unknown as Json })
        .eq("id", input.slot_id);
      if (error) fail(error);
      return { slot_id: input.slot_id };
    }),
});
