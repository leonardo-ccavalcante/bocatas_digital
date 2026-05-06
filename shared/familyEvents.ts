/**
 * familyEvents.ts — versioned (`v1`) Zod schemas for the 3 family lifecycle
 * webhook events emitted to Chatwoot/n8n.
 *
 * v1 scope was reduced from 5 to 3 events on 2026-05-06 by Karpathy review:
 *   - family.compliance.alert: dropped — no consumer wired today; n8n can poll
 *     `getComplianceStats` directly when a consumer arrives. Designing the
 *     event schema before the consumer locks shape prematurely.
 *   - family.session.closed: dropped — same reason. Re-add when the first
 *     consumer (per-family fan-out vs. one event with family_ids[]) is known.
 *
 * Source of truth (Phase B.7.1). Mirrors the WebhookPayload pattern in
 * server/routers/announcements/_shared.ts but with a Zod-first design so
 * the same schema validates both the producer (server emit call) and the
 * consumer (n8n flow input).
 *
 * RGPD constraints (NON-NEGOTIABLE — see CLAUDE.md §3 Compliance)
 *   - NO PII fields. `family_id` is an opaque UUID; `familia_numero` is a
 *     human-readable autoincrement integer that is NOT a personal
 *     identifier on its own.
 *   - The following high-risk fields MUST NEVER appear in any payload:
 *       situacion_legal, foto_documento_url, recorrido_migratorio.
 *   - No name, phone, document number, address, or DOB.
 *
 * The discriminated union `FamilyEvent` is keyed on the `event` field; the
 * `version` field is locked to "v1" so a future "v2" can evolve in
 * parallel without breaking n8n consumers wired to v1.
 */

import { z } from "zod";

// ─── Shared primitives ─────────────────────────────────────────────────────────

const uuidLike = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "Invalid UUID format",
  );

const familiaNumero = z.number().int().positive();

const isoTimestamp = z.string().datetime();

const versionV1 = z.literal("v1");

// ─── 1. family.created ─────────────────────────────────────────────────────────

export const FamilyCreatedSchema = z.object({
  event: z.literal("family.created"),
  version: versionV1,
  family_id: uuidLike,
  familia_numero: familiaNumero,
  num_adultos: z.number().int().min(0),
  num_menores_18: z.number().int().min(0),
  occurred_at: isoTimestamp,
});

export type FamilyCreatedEvent = z.infer<typeof FamilyCreatedSchema>;

// ─── 2. family.deactivated ─────────────────────────────────────────────────────

export const FamilyDeactivatedSchema = z.object({
  event: z.literal("family.deactivated"),
  version: versionV1,
  family_id: uuidLike,
  familia_numero: familiaNumero,
  // motivo_baja is a free-text field on families. To prevent leaking PII
  // accidentally typed into it, we emit only a coarse category here.
  motivo_categoria: z.enum([
    "voluntaria",
    "abandono",
    "incumplimiento",
    "traslado",
    "otro",
  ]),
  fecha_baja: z.string(),
  occurred_at: isoTimestamp,
});

export type FamilyDeactivatedEvent = z.infer<typeof FamilyDeactivatedSchema>;

// ─── 3. family.delivery.recorded ───────────────────────────────────────────────

export const FamilyDeliveryRecordedSchema = z.object({
  event: z.literal("family.delivery.recorded"),
  version: versionV1,
  family_id: uuidLike,
  familia_numero: familiaNumero,
  delivery_id: uuidLike,
  fecha_entrega: z.string(),
  kg_total: z.number().min(0),
  occurred_at: isoTimestamp,
});

export type FamilyDeliveryRecordedEvent = z.infer<
  typeof FamilyDeliveryRecordedSchema
>;

// ─── Discriminated union ───────────────────────────────────────────────────────

export const FamilyEventSchema = z.discriminatedUnion("event", [
  FamilyCreatedSchema,
  FamilyDeactivatedSchema,
  FamilyDeliveryRecordedSchema,
]);

export type FamilyEvent = z.infer<typeof FamilyEventSchema>;

/**
 * The exhaustive list of event names — useful as a runtime guard or for
 * documentation tables. Keep in sync with the discriminated union above.
 */
export const FAMILY_EVENT_NAMES = [
  "family.created",
  "family.deactivated",
  "family.delivery.recorded",
] as const;

export type FamilyEventName = (typeof FAMILY_EVENT_NAMES)[number];

/**
 * Fields that MUST NEVER appear in any family event payload (RGPD).
 * Exported so the test suite can assert the negative invariant on every
 * event schema in B.7.2.
 */
export const FORBIDDEN_PII_FIELDS = [
  "situacion_legal",
  "foto_documento_url",
  "recorrido_migratorio",
  "nombre",
  "apellidos",
  "telefono",
  "email",
  "documento_numero",
  "fecha_nacimiento",
  "direccion",
  "motivo_baja",
] as const;
