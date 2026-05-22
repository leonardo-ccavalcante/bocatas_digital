// T9 — Reparto cita/reschedule notification.
//
// Per CLAUDE.md, the app does NOT send WhatsApp/SMS directly: it emits an event
// to n8n/Chatwoot (on the VPS), which owns delivery. This is a best-effort,
// fire-and-forget POST of IDs ONLY (no PII in the payload). It is a no-op when
// N8N_REPARTO_WEBHOOK_URL is unset, so the feature ships without the integration.

export interface RepartoNotifyEvent {
  type: "reparto.reschedule";
  family_id: string;     // UUID only — no name/phone/DNI
  round_id: string;
  assigned_day: string;  // the new cita date
}

export async function notifyRepartoChange(event: RepartoNotifyEvent): Promise<void> {
  const url = process.env.N8N_REPARTO_WEBHOOK_URL;
  if (!url) return; // integration not configured → no-op (deferred-safe)
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
    });
  } catch {
    // Delivery is n8n's responsibility; never let notification failure break
    // the reschedule mutation. (No PII is logged.)
  }
}
