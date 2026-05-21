// server/routers/entregas/signature.ts
import { TRPCError } from "@trpc/server";
import { voluntarioProcedure, router } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { hashClientIp } from "../../../shared/ipHash";
import { RecordSignatureInputSchema } from "../../../client/src/features/families/schemas/signatureCapture";

export const signatureRouter = router({
  /**
   * recordSignature — wire the delivery_signature_audit append-only ledger.
   *
   * REQUIRES (production): migrations 20260509000001 + 20260509000002 applied.
   *
   * AUTH: voluntarioProcedure — voluntario, admin, superadmin may record.
   *
   * IMPORTANT — signer_person_id vs ctx.user.id:
   *   input.signerPersonId is the BENEFICIARY who signed (persons.id — UUID).
   *   ctx.user.id is the STAFF member recording (Drizzle MySQL int, NOT a UUID).
   *   Never use ctx.user.id as signer_person_id — it causes 22P02.
   */
  recordSignature: voluntarioProcedure
    .input(RecordSignatureInputSchema)
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();

      // ── [1] Guard: delivery must exist and be unsigned ───────────────────
      const { data: delivery, error: fetchErr } = await db
        .from("deliveries")
        .select("id, firma_url")
        .eq("id", input.deliveryId)
        .is("deleted_at", null)
        .maybeSingle();

      if (fetchErr || !delivery) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Entrega no encontrada",
        });
      }

      if (delivery.firma_url !== null) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Ya existe una firma para esta entrega",
        });
      }

      // ── [2] Hash client IP ───────────────────────────────────────────────
      const rawIp =
        (ctx.req.headers["x-forwarded-for"] as string | undefined)
          ?.split(",")[0]
          ?.trim() ??
        ctx.req.socket?.remoteAddress ??
        null;

      const { data: saltRow } = await db
        .from("app_settings")
        .select("value")
        .eq("key", "ip_daily_salt")
        .maybeSingle();

      const clientIpHash = hashClientIp(rawIp, saltRow?.value ?? null);

      // ── [3] Upload signature to firmas-entregas bucket ───────────────────
      const today = new Date().toISOString().slice(0, 10);
      const storagePath = `firmas-entregas/${input.deliveryId}/${today}.png`;

      const base64Data = input.signatureDataUrl.replace(
        /^data:image\/\w+;base64,/,
        ""
      );
      const buffer = Buffer.from(base64Data, "base64");

      const { error: uploadErr } = await db.storage
        .from("firmas-entregas")
        .upload(storagePath, buffer, {
          contentType: "image/png",
          upsert: false,
        });

      if (uploadErr) {
        // No DB state changed yet — safe to abort.
        ctx.logger.error("firma upload failed", {
          correlationId: ctx.correlationId,
          deliveryId: input.deliveryId,
          // Never log signerPersonId or raw IP — PII guard.
          storageError: uploadErr.message,
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Error al subir la firma. Inténtalo de nuevo.",
        });
      }

      // ── [4] Patch deliveries.firma_url ───────────────────────────────────
      const { error: patchErr } = await db
        .from("deliveries")
        .update({
          firma_url: storagePath,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.deliveryId);

      if (patchErr) {
        // Best-effort cleanup so storage and DB stay in sync. Cleanup failure
        // is logged but not surfaced to the client.
        try {
          await db.storage.from("firmas-entregas").remove([storagePath]);
        } catch (cleanupErr) {
          ctx.logger.error("firma storage cleanup failed after patch error", {
            correlationId: ctx.correlationId,
            deliveryId: input.deliveryId,
            storagePath,
            cleanupError:
              cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Error al registrar la firma. Inténtalo de nuevo.",
        });
      }

      // ── [5] Insert delivery_signature_audit ──────────────────────────────
      const { data: auditRow, error: auditErr } = await db
        .from("delivery_signature_audit")
        .insert({
          delivery_id: input.deliveryId,
          signer_person_id: input.signerPersonId,
          client_ip_hash: clientIpHash,
          // signed_at: NOT supplied — DB DEFAULT now() is the server clock.
          // Never allow client to supply this value (T2 contract).
        })
        .select("id, delivery_id, signer_person_id, signed_at")
        .single();

      if (auditErr) {
        if (auditErr.code === "23505") {
          // No storage cleanup here by design: a true concurrent double-write
          // is self-protecting — the same dated storagePath + upsert:false means
          // the losing writer's upload (step 3) already failed before reaching
          // this insert, so there is no orphaned object to remove.
          throw new TRPCError({
            code: "CONFLICT",
            message: "Ya existe una firma para esta entrega",
          });
        }
        if (auditErr.code === "23503") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "La persona firmante no existe en el registro",
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Error al registrar el registro de auditoría de la firma.",
        });
      }

      return auditRow;
    }),
});
