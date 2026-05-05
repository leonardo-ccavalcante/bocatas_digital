import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import {
  ANNOUNCEMENT_TYPES,
  type TipoAnnouncement,
  type AudienceRule,
  type AnnouncementRole,
  type AnnouncementProgram,
} from "../../../shared/announcementTypes";
import type { AuditChange } from "../../announcements-helpers";

// ─── Shared Zod primitives ─────────────────────────────────────────────────────

export const uuidLike = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "Invalid UUID format"
  );

/** Only the 4 current tipo values — legacy values blocked by CHECK constraint in DB */
export const AnnouncementTipoEnum = z.enum(
  [...ANNOUNCEMENT_TYPES] as [TipoAnnouncement, ...TipoAnnouncement[]]
);

export const AudienceRuleSchema = z.object({
  roles: z.array(
    z.enum(["superadmin", "admin", "voluntario", "beneficiario"] as const)
  ),
  programs: z.array(
    z.enum([
      "comedor",
      "familia",
      "formacion",
      "atencion_juridica",
      "voluntariado",
      "acompanamiento",
    ] as const)
  ),
});

export const CreateAnnouncementSchema = z.object({
  titulo: z.string().min(1).max(200),
  contenido: z.string().min(1).max(5000),
  tipo: AnnouncementTipoEnum.default("info"),
  es_urgente: z.boolean().default(false),
  fecha_inicio: z.string().datetime().optional(),
  fecha_fin: z.string().datetime().optional().nullable(),
  published_at: z.string().date().optional(),
  expires_at: z.string().date().optional(),
  fijado: z.boolean().default(false),
  imagen_url: z.string().url().optional().nullable(),
  audiences: z.array(AudienceRuleSchema).min(1),
});

// NOTE: autor_id and autor_nombre are intentionally absent — defense in depth
// against the Postgres trigger that blocks UPDATEs changing those columns.
export const UpdateAnnouncementSchema = z.object({
  id: uuidLike,
  titulo: z.string().min(1).max(200).optional(),
  contenido: z.string().min(1).max(5000).optional(),
  tipo: AnnouncementTipoEnum.optional(),
  es_urgente: z.boolean().optional(),
  fecha_inicio: z.string().datetime().optional(),
  fecha_fin: z.string().datetime().optional().nullable(),
  published_at: z.string().date().optional(),
  expires_at: z.string().date().optional(),
  fijado: z.boolean().optional(),
  imagen_url: z.string().url().optional().nullable(),
  audiences: z.array(AudienceRuleSchema).min(1).optional(),
});

// ─── Webhook types ────────────────────────────────────────────────────────────

export interface WebhookPayload {
  event: "announcement.urgent.created";
  announcement_id: string;
  titulo: string;
  contenido_preview: string;
  tipo: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  audiences: AudienceRule[];
  autor_nombre: string | null;
  app_url: string;
}

// ─── Row shape used for diffForAudit ──────────────────────────────────────────

export interface AnnouncementMutableSnapshot {
  titulo: string;
  contenido: string;
  tipo: TipoAnnouncement;
  es_urgente: boolean;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  fijado: boolean;
  imagen_url: string | null;
}

// ─── Fire-and-forget webhook ──────────────────────────────────────────────────

export async function fireUrgentWebhook(payload: WebhookPayload): Promise<void> {
  const url = process.env.URGENT_WEBHOOK_URL;
  const db = createAdminClient();
  if (!url) {
    await db.from("announcement_webhook_log").insert({
      announcement_id: payload.announcement_id,
      attempted_at: new Date().toISOString(),
      status_code: null,
      response_body: null,
      error: "no webhook configured",
    });
    return;
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.text().catch(() => "");
    await db.from("announcement_webhook_log").insert({
      announcement_id: payload.announcement_id,
      attempted_at: new Date().toISOString(),
      status_code: res.status,
      response_body: body.slice(0, 500),
      error: res.ok ? null : `HTTP ${res.status}`,
    });
  } catch (err: unknown) {
    await db.from("announcement_webhook_log").insert({
      announcement_id: payload.announcement_id,
      attempted_at: new Date().toISOString(),
      status_code: null,
      response_body: null,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── Inline CSV parser (RFC 4180 quoted-field aware) ─────────────────────────
// Reuses the same logic as csvFamiliesWithMembers.ts — robust enough for
// quoted fields containing commas or line-break-free content.

export function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

// ─── Helper: write N audit rows atomically (non-transactional — Supabase REST
// does not expose multi-statement transactions. We do a bulk INSERT instead.) ──

export async function writeAuditRows(
  db: ReturnType<typeof createAdminClient>,
  announcement_id: string,
  edited_by: string,
  changes: AuditChange[]
): Promise<void> {
  if (changes.length === 0) return;
  const rows = changes.map((c) => ({
    announcement_id,
    edited_by,
    edited_at: new Date().toISOString(),
    field: c.field,
    old_value: c.old_value !== undefined ? JSON.stringify(c.old_value) : null,
    new_value: c.new_value !== undefined ? JSON.stringify(c.new_value) : null,
  }));
  const { error } = await db.from("announcement_audit_log").insert(rows);
  if (error) {
    // Audit failure must NOT block the write — log and continue.
    console.error("[announcements] audit log write failed:", error.message);
  }
}

// ─── Helper: replace all audience rules for an announcement ──────────────────

export async function replaceAudiences(
  db: ReturnType<typeof createAdminClient>,
  announcement_id: string,
  audiences: readonly AudienceRule[]
): Promise<void> {
  const { error: delErr } = await db
    .from("announcement_audiences")
    .delete()
    .eq("announcement_id", announcement_id);
  if (delErr) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: delErr.message });

  const rows = audiences.map((a) => ({
    announcement_id,
    roles: [...a.roles] as AnnouncementRole[],
    programs: [...a.programs] as AnnouncementProgram[],
  }));
  const { error: insErr } = await db.from("announcement_audiences").insert(rows);
  if (insErr) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: insErr.message });
}
