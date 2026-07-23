import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure, voluntarioProcedure } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { hashClientIp } from "../../../shared/ipHash";
import { RecordRepartoFirmaSchema } from "../../../shared/repartoSchemas";

const uuid = z.string().uuid();
const BUCKET = "firmas-entregas";

// RGPD gate: on-screen signature collection is OFF until the lawyer sign-off +
// EIPD addendum. Env-presence flag (no flag framework — matches N8N/PostHog).
// Unset → the procedure refuses with PRECONDITION_FAILED and the UI stays hidden.
function assertFirmaEnabled() {
  if (!process.env.REPARTO_FIRMA_ENABLED)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "La firma digital no está habilitada",
    });
}

// Defence-in-depth over the Zod dataURL regex: check the real decoded bytes.
function sniffImage(buffer: Buffer): "png" | "jpeg" | null {
  if (buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";
  return null;
}

export const roundsSignatureRouter = router({
  // Whether on-screen signing is enabled (single source of truth = server env).
  // The UI hides the sign flow when this is false; no client env flag to drift.
  getFirmaEnabled: voluntarioProcedure.query(() => ({
    enabled: !!process.env.REPARTO_FIRMA_ENABLED,
  })),

  // On-screen signature at pickup: upload the bitmap, then atomically stamp
  // attendance + append the append-only audit row via record_reparto_pickup.
  // Idempotent on a lost-response retry (same assignment+slot+signer → same row).
  recordRepartoSignature: voluntarioProcedure
    .input(RecordRepartoFirmaSchema)
    .mutation(async ({ input, ctx }) => {
      assertFirmaEnabled();
      const db = createAdminClient();

      // ── IDOR guard: the signer must be a (non-deleted) member of the
      // assignment's family. Never trust the client-supplied signer id. ──
      const { data: asg, error: ae } = await db
        .from("delivery_round_assignments")
        .select("id, family_id")
        .eq("id", input.assignment_id)
        .maybeSingle();
      if (ae || !asg) throw new TRPCError({ code: "NOT_FOUND", message: "Asignación no encontrada" });

      const { data: member } = await db
        .from("familia_miembros")
        .select("person_id")
        .eq("familia_id", asg.family_id)
        .eq("person_id", input.signer_person_id)
        .is("deleted_at", null)
        .maybeSingle();
      if (!member)
        throw new TRPCError({ code: "FORBIDDEN", message: "El firmante no pertenece a esta familia" });

      // ── Decode + validate the bytes (magic bytes, not just the MIME prefix) ──
      const base64 = input.signature_data_url.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64, "base64");
      const kind = sniffImage(buffer);
      if (!kind) throw new TRPCError({ code: "BAD_REQUEST", message: "Formato de firma inválido" });

      // ── Hash client IP with the daily salt (minimisation — no raw IP stored) ──
      const rawIp =
        (ctx.req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
        ctx.req.socket?.remoteAddress ??
        null;
      const { data: saltRow } = await db
        .from("app_settings").select("value").eq("key", "ip_daily_salt").maybeSingle();
      const ipHash = hashClientIp(rawIp, saltRow?.value ?? null);

      // ── Upload the bitmap (opaque path; upsert:false). A pre-existing object
      // means a retry — keep it and let the idempotent RPC reconcile. ──
      const storagePath = `repartos/${input.assignment_id}/${input.slot_id}.${kind === "png" ? "png" : "jpg"}`;
      const { error: upErr } = await db.storage
        .from(BUCKET)
        .upload(storagePath, buffer, { contentType: `image/${kind}`, upsert: false });
      const alreadyThere = !!upErr && /exists|duplicate|409/i.test(upErr.message);
      const didUpload = !upErr;
      if (upErr && !alreadyThere) {
        ctx.logger.error("firma upload failed", { correlationId: ctx.correlationId, storageError: upErr.message });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Error al subir la firma. Inténtalo de nuevo." });
      }

      // ── Atomic attendance + audit ──
      const { data, error } = await db.rpc("record_reparto_pickup", {
        p_assignment_id: input.assignment_id,
        p_slot_id: input.slot_id,
        p_signer_person_id: input.signer_person_id,
        p_storage_path: storagePath,
        // The generated arg type is `string`, but the RPC's TEXT param + the audit
        // column are nullable; store an honest NULL when no IP was available.
        p_ip_hash: ipHash as string,
        p_actor: String(ctx.user.id),
      });
      if (error) {
        if (didUpload) {
          try { await db.storage.from(BUCKET).remove([storagePath]); } catch { /* best-effort */ }
        }
        if (error.message.includes("firma_conflicto"))
          throw new TRPCError({ code: "CONFLICT", message: "Ya existe una firma distinta para esta entrega" });
        if (error.message.includes("ya_atendida"))
          throw new TRPCError({ code: "CONFLICT", message: "La familia ya fue atendida en otro turno" });
        if (error.message.includes("turno_cerrado") || error.message.includes("ronda_cerrada"))
          throw new TRPCError({ code: "CONFLICT", message: "El turno está cerrado" });
        if (error.message.includes("slot_ajeno"))
          throw new TRPCError({ code: "BAD_REQUEST", message: "El turno no pertenece a esta ronda" });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Error al registrar la firma" });
      }
      const row = Array.isArray(data) ? data[0] : data;
      return { audit_id: row?.audit_id ?? null, signed_at: row?.audit_signed_at ?? null };
    }),

  // Signature audit for a round (ADMIN) — metadata only, never the bitmap bytes.
  getSignatureAudit: adminProcedure
    .input(z.object({ round_id: uuid }))
    .query(async ({ input }) => {
      assertFirmaEnabled();
      const db = createAdminClient();
      const { data: asgs } = await db
        .from("delivery_round_assignments").select("id").eq("round_id", input.round_id);
      const ids = (asgs ?? []).map((a) => a.id);
      if (ids.length === 0) return { rows: [] };
      const { data, error } = await db
        .from("reparto_signature_audit")
        .select("id, assignment_id, slot_id, signer_person_id, signed_at, storage_path")
        .in("assignment_id", ids);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { rows: data ?? [] };
    }),
});
