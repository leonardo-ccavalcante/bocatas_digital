// Inbound n8n webhook: a family's reply with the day(s) they can come.
//
// The app never talks to WhatsApp directly (ADR-0005); n8n on the VPS owns the
// conversation and POSTs the parsed reply here. Auth is a shared secret header;
// the route is a no-op (503) until N8N_REPARTO_INBOUND_SECRET is set, so it ships
// inert. Mirror of the outbound reparto-notify.ts. Sets the family's preferred
// slots (fecha 1 / fecha 2 on the citación) or an early renuncia.
import type { Request, Response } from "express";
import { z } from "zod";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import type { Json } from "../../../client/src/lib/database.types";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const InboundSchema = z
  .object({
    round_id: z.string().uuid(),
    family_id: z.string().uuid().optional(),
    familia_numero: z.number().int().positive().optional(),
    preferred_dates: z.array(isoDate).max(2).optional(),
    estado_contacto: z.enum(["confirmada", "no_contesta", "renuncia"]).optional(),
  })
  .refine((v) => v.family_id != null || v.familia_numero != null, {
    message: "family_id o familia_numero requerido",
  });

// The shared-secret gate (503-when-unset / 401-on-mismatch) runs in the route
// middleware BEFORE express.json (see server/_core/index.ts), so an unauthenticated
// body is never parsed. This handler only runs once auth has passed.
export async function handleRepartoContactoInbound(req: Request, res: Response): Promise<void> {
  const parsed = InboundSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" }); // never echo the body (may carry PII)
    return;
  }
  const { round_id, family_id, familia_numero, preferred_dates, estado_contacto } = parsed.data;
  const db = createAdminClient();

  // Resolve the family (by uuid or numeric number).
  let fid = family_id ?? null;
  if (!fid && familia_numero != null) {
    const { data: fam } = await db
      .from("families")
      .select("id")
      .eq("familia_numero", familia_numero)
      .maybeSingle();
    fid = fam?.id ?? null;
  }
  if (!fid) {
    res.status(404).json({ error: "familia no encontrada" });
    return;
  }

  const { data: asg } = await db
    .from("delivery_round_assignments")
    .select("id, reschedule_log")
    .eq("round_id", round_id)
    .eq("family_id", fid)
    .maybeSingle();
  if (!asg) {
    res.status(404).json({ error: "asignación no encontrada" });
    return;
  }

  // Resolve preferred dates → slot ids (first slot per date; ≤2).
  let preferredSlotIds: string[] = [];
  if (preferred_dates?.length) {
    const { data: slots } = await db
      .from("delivery_round_slots")
      .select("id, slot_date")
      .eq("round_id", round_id)
      .order("slot_date", { ascending: true });
    const byDate = new Map<string, string>();
    for (const s of slots ?? []) if (!byDate.has(s.slot_date)) byDate.set(s.slot_date, s.id);
    preferredSlotIds = preferred_dates
      .map((d) => byDate.get(d))
      .filter((x): x is string => !!x)
      .slice(0, 2);
  }

  const estado = estado_contacto ?? "confirmada";
  const isRenuncia = estado === "renuncia";
  const prevLog = Array.isArray(asg.reschedule_log) ? asg.reschedule_log : [];
  const logEntry = { source: "n8n", at: new Date().toISOString(), estado, preferred_dates: preferred_dates ?? [] };

  // Match the manual setContactoFamilia write exactly: a renuncia CLEARS preferred
  // slots (else the citación keeps printing the renounced family's old dates) and
  // stamps attendance as absent.
  const { error } = await db
    .from("delivery_round_assignments")
    .update({
      estado_contacto: estado,
      preferred_slot_ids: isRenuncia ? [] : preferredSlotIds,
      ...(isRenuncia
        ? { attended: false, attended_slot_id: null, attended_at: new Date().toISOString(), attended_by: "n8n" }
        : {}),
      reschedule_log: [...prevLog, logEntry] as unknown as Json,
    })
    .eq("id", asg.id);
  if (error) {
    res.status(500).json({ error: "update failed" });
    return;
  }
  res.status(200).json({ ok: true, assignment_id: asg.id, preferred_slot_ids: preferredSlotIds });
}
