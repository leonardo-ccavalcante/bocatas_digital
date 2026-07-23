/**
 * programs.sessionAlerts.ts — Fire-and-forget webhook alerts for overdue sessions.
 *
 * Wired as programs.sessionAlerts.* in the programsRouter.
 *
 * Pattern mirrors reparto-notify.ts (ADR-0005):
 * - Never sends WhatsApp/email directly — emits an event to n8n/Chatwoot on the VPS.
 * - Fire-and-forget POST; delivery failure never breaks the mutation.
 * - IDs ONLY in the webhook payload — no PII.
 * - No-op when SESSION_ALERT_WEBHOOK_URL is unset (deferred-safe).
 *
 * GROUP 7b fix: hora_fin now interpreted in Europe/Madrid local time (DST-aware)
 * rather than UTC — alerts no longer fire 1-2h late during summer time.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../_core/trpc";
import { createAdminClient } from "../../client/src/lib/supabase/server";

const uuidLike = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "UUID inválido");

export interface SessionAlertEvent {
  type: "session.alert.overdue";
  session_id: string;
  program_id: string;
  fecha: string;
}

/** Fire-and-forget webhook for a single overdue session alert.
 * No-op when SESSION_ALERT_WEBHOOK_URL is not set. IDs only — no PII. */
async function emitSessionAlertWebhook(event: SessionAlertEvent): Promise<void> {
  const url = process.env.SESSION_ALERT_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
    });
  } catch {
    // Delivery is n8n's responsibility; never let a webhook failure surface here.
    // No PII is logged (only IDs travel in the payload above).
  }
}

/** How many hours past hora_fin a session must be before it triggers an alert. */
const OVERDUE_THRESHOLD_HOURS = 2;

/**
 * Converts a local date+time in Europe/Madrid timezone to a UTC Date.
 * DST-aware: tries CEST (UTC+2) then CET (UTC+1) offsets.
 * GROUP 7b: prevents "past hora_fin" alerts from firing 1-2h late in summer.
 */
function toMadridUtc(fecha: string, hora: string): Date {
  const [targetH] = hora.split(":").map(Number);
  for (const offset of ["+02:00", "+01:00"]) {
    const candidate = new Date(`${fecha}T${hora}:00.000${offset}`);
    const localH = parseInt(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "Europe/Madrid",
        hour: "2-digit",
        hour12: false,
      }).format(candidate),
      10
    );
    if (localH === targetH) return candidate;
  }
  return new Date(`${fecha}T${hora}:00.000+01:00`);
}

export const sessionAlertsRouter = router({
  /**
   * Finds planificada sessions past hora_fin + threshold and emits an alert per session.
   * Always alerts, never acts (no auto-state-change).
   * Returns the count of alerts emitted.
   */
  emitSessionAlerts: adminProcedure
    .input(z.object({
      programId: uuidLike.optional(),
    }))
    .mutation(async ({ input }) => {
      const supabase = createAdminClient();

      let query = supabase
        .from("program_sessions")
        .select("id, program_id, fecha, hora_fin, estado")
        .eq("estado", "planificada");

      if (input.programId) {
        query = query.eq("program_id", input.programId);
      }

      const { data, error } = await query;
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      const now = new Date();
      let emitted = 0;

      for (const session of data ?? []) {
        if (!session.hora_fin) continue;

        // GROUP 7b: interpret hora_fin as Europe/Madrid local time
        const sessionEnd = toMadridUtc(session.fecha, session.hora_fin);
        const thresholdMs = OVERDUE_THRESHOLD_HOURS * 3600 * 1000;

        if (now.getTime() - sessionEnd.getTime() < thresholdMs) continue;

        // Fire-and-forget — do not await in the loop (parallel is fine here)
        void emitSessionAlertWebhook({
          type: "session.alert.overdue",
          session_id: session.id,
          program_id: session.program_id,
          fecha: session.fecha,
        });
        emitted++;
      }

      return { emitted };
    }),
});
