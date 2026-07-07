import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, voluntarioProcedure } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { extractActaSignatures } from "../../_core/acta-ocr";
import { resolveRepresentatives } from "./reparto-helpers";
import {
  buildCloseoutProposal,
  type AssignmentLite,
} from "../../../client/src/features/familias-reparto/utils/actaCloseoutMatch";

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

export const roundsOcrRouter = router({
  // OCR-assisted close-out PROPOSAL — read-only. Reads the SLOT's signed-acta
  // photo, OCRs expediente+firma per row, matches to the KNOWN slot roster, and
  // returns a proposal for the operator to review/confirm. Writes nothing; the
  // UI confirms via bulkMarkAttendance. (Never autonomous.)
  proposeActaCloseout: voluntarioProcedure
    .input(z.object({ round_id: uuid, slot_id: uuid }))
    .mutation(async ({ input }) => {
      const db = createAdminClient();

      const { data: slot } = await db
        .from("delivery_round_slots")
        .select("slot_date, turno, signed_acta")
        .eq("id", input.slot_id)
        .eq("round_id", input.round_id)
        .single();
      if (!slot) throw new TRPCError({ code: "NOT_FOUND", message: "Turno no encontrado" });
      const path = (slot.signed_acta as { url?: string } | null)?.url;
      if (!path) throw new TRPCError({ code: "NOT_FOUND", message: "Primero fotografía el acta firmada de este turno" });

      const { data: signed, error: se } = await db.storage
        .from("family-documents")
        .createSignedUrl(path, 600);
      if (se || !signed?.signedUrl) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No se pudo abrir la foto del acta" });

      const ocr = await extractActaSignatures(signed.signedUrl);
      if (!ocr.success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: ocr.errors?.join("; ") ?? "Error de OCR" });

      const { data: rows } = await db
        .from("delivery_round_assignments")
        .select("id, family_id, expediente")
        .eq("round_id", input.round_id)
        .eq("assigned_day", slot.slot_date)
        .eq("turno", slot.turno);
      const list = rows ?? [];
      const reps = await resolveRepresentatives(db, [...new Set(list.map((r) => r.family_id))]);
      const assignments: AssignmentLite[] = list.map((r) => {
        const rep = reps.get(r.family_id);
        return {
          id: r.id,
          expediente: r.expediente,
          nombre: rep ? [rep.nombre, rep.apellidos].filter(Boolean).join(" ").trim() || null : null,
        };
      });

      const proposal = buildCloseoutProposal(ocr.rows, assignments);
      return { proposal, extractionConfidence: ocr.extractionConfidence, warnings: ocr.warnings };
    }),
});
