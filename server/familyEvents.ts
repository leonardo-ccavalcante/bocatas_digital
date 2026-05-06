/**
 * server/familyEvents.ts — fire-and-forget emit helper for the 5 family
 * lifecycle webhooks (Phase B.7.3).
 *
 * Mirrors `server/routers/announcements/webhook.ts` (hardened in A.5):
 *   - 3 attempts max
 *   - 1s delay between attempts
 *   - Retries only on transient 5xx and thrown errors (stops on 2xx/4xx)
 *   - Logs final outcome to `family_webhook_log`
 *
 * Webhook URL is resolved from `app_settings.webhook_url` so operations can
 * rotate the n8n endpoint without redeploying. Same pattern as
 * `getGufSystemDefault` in server/routers/families/guf.ts.
 *
 * RGPD: payloads are validated against the v1 Zod schemas in
 * shared/familyEvents.ts, which reject any PII field at the type level.
 * If a caller accidentally adds a PII field, parse() throws — the webhook
 * is never sent.
 */

import { createAdminClient } from "../client/src/lib/supabase/server";
import {
  FamilyEventSchema,
  type FamilyEvent,
} from "../shared/familyEvents";

// ─── Retry policy (locked to match announcements/webhook.ts) ──────────────────

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── App settings lookup ──────────────────────────────────────────────────────

interface AdminDb {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        maybeSingle(): Promise<{ data: { value: string } | null }>;
      };
    };
    insert(row: FamilyWebhookLogRow): Promise<{ error: unknown }>;
  };
}

async function resolveWebhookUrl(db: AdminDb): Promise<string | null> {
  const { data } = await db
    .from("app_settings")
    .select("value")
    .eq("key", "webhook_url")
    .maybeSingle();
  return data?.value ?? null;
}

// ─── Log row shape ────────────────────────────────────────────────────────────

interface FamilyWebhookLogRow {
  family_id: string;
  event: string;
  attempted_at: string;
  status_code: number | null;
  response_body: string | null;
  error: string | null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fire-and-forget emit. Validates the payload against the v1 Zod schema
 * (rejects PII at parse time), POSTs to `app_settings.webhook_url`, retries
 * on transient 5xx, and writes one row to `family_webhook_log` on
 * completion.
 *
 * Errors are NEVER thrown to the caller — webhook delivery must never
 * block a user-facing mutation. Validation failures are logged and
 * swallowed (same fail-safe contract as fireUrgentWebhook).
 */
export async function emitFamilyEvent(event: FamilyEvent): Promise<void> {
  // Defense in depth: parse() throws if a PII field accidentally leaks in.
  // We catch it locally so the parent mutation is never blocked.
  const parsed = FamilyEventSchema.safeParse(event);
  if (!parsed.success) {
    // Cannot log to DB without a valid family_id — at least surface the
    // failure to stderr so it is visible in server logs.
    // eslint-disable-next-line no-console
    console.error(
      "emitFamilyEvent: payload failed schema validation",
      parsed.error.issues,
    );
    return;
  }

  const payload = parsed.data;
  const db = createAdminClient() as unknown as AdminDb;
  const url = await resolveWebhookUrl(db);

  if (!url) {
    await db.from("family_webhook_log").insert({
      family_id: payload.family_id,
      event: payload.event,
      attempted_at: new Date().toISOString(),
      status_code: null,
      response_body: null,
      error: "no webhook configured",
    });
    return;
  }

  let lastStatus: number | null = null;
  let lastBody = "";
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.text().catch(() => "");
      lastStatus = res.status;
      lastBody = body;
      lastError = res.ok ? null : `HTTP ${res.status}`;
      if (res.ok || res.status < 500) break;
    } catch (err: unknown) {
      lastStatus = null;
      lastBody = "";
      lastError = err instanceof Error ? err.message : String(err);
    }
    if (attempt < MAX_ATTEMPTS) {
      await sleep(RETRY_DELAY_MS);
    }
  }

  await db.from("family_webhook_log").insert({
    family_id: payload.family_id,
    event: payload.event,
    attempted_at: new Date().toISOString(),
    status_code: lastStatus,
    response_body: lastBody.slice(0, 500),
    error: lastError,
  });
}
