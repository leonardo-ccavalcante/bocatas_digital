/**
 * persons/qr.ts — QR-code procedures (Phase 6 QA-1A).
 *
 * Two procedures:
 *   - getQrPayload({ personId }): admin/voluntario builds a signed URI for any
 *     person they're allowed to view. Used by `QRCodeCard.tsx` for printable
 *     beneficiary cards.
 *   - getCheckinTarget({ uuid, sig }): scanner verifies the signature and
 *     returns the minimum data needed to render the check-in confirmation.
 *     Returns NOT_FOUND on signature mismatch (do not leak whether the UUID
 *     exists when the sig is wrong — protects against UUID-enumeration).
 *
 * RGPD: payload contains zero PII (UUID + 8-hex sig). Secret is server-side
 * only; never shipped to client.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../_core/trpc";
import { ENV } from "../../_core/env";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { buildQrPayload, verifySig } from "../../../shared/qr/payload";
import { uuidLike } from "./_shared";

function ensureSecret(): string {
  if (!ENV.qrSigningSecret || ENV.qrSigningSecret.length < 32) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "QR signing secret not configured",
    });
  }
  return ENV.qrSigningSecret;
}

export const qrRouter = router({
  /**
   * Build a signed QR payload for the requested person.
   * Authorization: admin/superadmin/voluntario only (server-side gate).
   */
  getQrPayload: protectedProcedure
    .input(z.object({ personId: uuidLike }))
    .query(async ({ input, ctx }) => {
      const role = ctx.user.role;
      if (role !== "admin" && role !== "superadmin" && role !== "voluntario") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Solo admin/superadmin/voluntario pueden generar QR",
        });
      }
      // Verify the person exists (and is not soft-deleted) before signing —
      // prevents a leaking oracle for valid UUIDs.
      const db = createAdminClient();
      const { data, error } = await db
        .from("persons")
        .select("id")
        .eq("id", input.personId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error || !data) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Persona no encontrada",
        });
      }
      const payload = await buildQrPayload(input.personId, ensureSecret());
      return { payload };
    }),

  /**
   * Verify the QR signature and return minimum check-in data.
   *
   * Returns NOT_FOUND on:
   *   - bad signature
   *   - non-existent uuid
   *   - soft-deleted person
   * (Same code on all three so no enumeration is possible.)
   *
   * Returned fields are PII — only allowed because the caller already
   * proved possession of a server-signed token. Caller is also
   * authenticated (protectedProcedure) — voluntario is the typical
   * scanner.
   */
  getCheckinTarget: protectedProcedure
    .input(z.object({ uuid: uuidLike, sig: z.string().regex(/^[a-f0-9]{8}$/) }))
    .query(async ({ input }) => {
      const ok = await verifySig(input.uuid, input.sig, ensureSecret());
      if (!ok) {
        throw new TRPCError({ code: "NOT_FOUND", message: "QR inválido" });
      }
      const db = createAdminClient();
      const { data, error } = await db
        .from("persons")
        .select(
          "id, nombre, apellidos, foto_perfil_url, restricciones_alimentarias, fase_itinerario"
        )
        .eq("id", input.uuid)
        .is("deleted_at", null)
        .maybeSingle();
      if (error || !data) {
        throw new TRPCError({ code: "NOT_FOUND", message: "QR inválido" });
      }
      return data;
    }),
});
