import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import type { Json } from "../../../client/src/lib/database.types";
import { storagePut } from "../../storage";
import { buildRoundActa } from "./reparto-helpers";

interface SignedActaEntry { url: string; by: string; at: string }

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

/** base64 inflates ~33% and this path is body-limited to 10 MB
 *  (server/_core/index.ts LARGE_PAYLOAD_PATHS), so ~7.5 MiB decoded is the
 *  effective ceiling — same trade-off as persons.uploadPhoto. */
const MAX_ACTA_BYTES = 10 * 1024 * 1024;

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
  // The bytes arrive as base64 and are written SERVER-SIDE (service role,
  // ADR-0002) into the PRIVATE family-documents bucket — it has no storage
  // policies, so a browser anon-key upload always 403s (RC-03/F184). We store
  // only path + audit (who/when) on the slot; reads mint signed URLs.
  attachSignedActa: adminProcedure
    .input(z.object({ round_id: uuid, slot_id: uuid, base64: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const buffer = Buffer.from(input.base64, "base64");
      if (buffer.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "La foto está vacía" });
      }
      if (buffer.length > MAX_ACTA_BYTES) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "La foto supera el límite de 10 MB" });
      }

      const db = createAdminClient();
      const { data: slot, error: se } = await db
        .from("delivery_round_slots")
        .select("id, round_id")
        .eq("id", input.slot_id)
        .eq("round_id", input.round_id)
        .single();
      if (se || !slot) throw new TRPCError({ code: "NOT_FOUND", message: "Turno no encontrado" });

      const { path } = await storagePut(
        "family-documents",
        `actas-firmadas/${input.round_id}/${input.slot_id}.jpg`,
        buffer,
        "image/jpeg"
      );

      const entry: SignedActaEntry = { url: path, by: String(ctx.user.id), at: new Date().toISOString() };
      const { error } = await db
        .from("delivery_round_slots")
        .update({ signed_acta: entry as unknown as Json })
        .eq("id", input.slot_id);
      if (error) fail(error);
      return { slot_id: input.slot_id, path };
    }),
});
