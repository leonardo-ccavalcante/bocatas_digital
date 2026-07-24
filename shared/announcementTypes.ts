/**
 * Single source of truth for the announcement `tipo` enum.
 *
 * Used by:
 *  - DB enum tipo_announcement (migration 20260501000001)
 *  - tRPC router input schema (server/routers/announcements.ts)
 *  - Admin form select (client/src/pages/AdminNovedades.tsx + CrearNovedadButton.tsx)
 *  - Public feed chip filter (client/src/pages/Novedades.tsx)
 *  - Bulk CSV validator (server/announcements-helpers.ts)
 *
 * Add a value here ONLY after you have:
 *  1. Added it to the DB enum (new migration)
 *  2. Considered whether existing UI surfaces need a chip color
 *  3. Updated this file
 *
 * NEVER add 'urgente' or 'cierre' — those are LEGACY values kept readable
 * in the DB enum for back-compat but BLOCKED for new writes by a CHECK
 * constraint (migration 20260501000003). Urgency is now a separate boolean
 * `es_urgente` on the announcements row.
 */

export const ANNOUNCEMENT_TYPES = [
  "info",
  "evento",
  "cierre_servicio",
  "convocatoria",
] as const;

export type TipoAnnouncement = (typeof ANNOUNCEMENT_TYPES)[number];

/** Legacy values kept readable in DB but rejected for new writes. */
export const LEGACY_ANNOUNCEMENT_TYPES = ["cierre", "urgente"] as const;

export type LegacyTipoAnnouncement = (typeof LEGACY_ANNOUNCEMENT_TYPES)[number];

/** Human-readable Spanish label for each value (UI chip text + dropdown options). */
export const ANNOUNCEMENT_TYPE_LABELS: Record<TipoAnnouncement, string> = {
  info: "Info",
  evento: "Evento",
  cierre_servicio: "Cierre",
  convocatoria: "Convocatoria",
};

/**
 * Inline doc per value — used in the admin form helper text + CSV author guide.
 * Keep terse (one line each).
 */
export const ANNOUNCEMENT_TYPE_DESCRIPTIONS: Record<TipoAnnouncement, string> = {
  info: "Información general (bienvenidas, recordatorios, novedades del equipo).",
  evento: "Fecha planificada a la que el destinatario puede asistir (reunión, donante, formación).",
  cierre_servicio: "El servicio no operará o tendrá horario alterado (comedor cerrado, sin reparto).",
  convocatoria: "Llamada para que voluntarios se apunten o cubran un turno extra.",
};

/** Roles enum values mirrored from the auth/persons schema. Used for bulk-CSV DSL validation. */
export const ANNOUNCEMENT_ROLES = ["superadmin", "admin", "voluntario", "beneficiario"] as const;
export type AnnouncementRole = (typeof ANNOUNCEMENT_ROLES)[number];

/**
 * Programs enum values mirrored from the `programa` PostgreSQL ENUM type
 * (migration 20260411081827) — NOT the same thing as the dynamic `programs`
 * catalog TABLE added later by the program-tree feature (#130, ADR-0013).
 * `announcement_audiences.programs` is still typed `programa[]` (verified:
 * no `ALTER TYPE programa` / no column-type migration exists for that table),
 * so this closed list is still what the DB will actually accept today —
 * unlike `attendances.programa`, which WAS migrated off this enum to
 * `text` + FK to `programs.slug` (see `20260520000001_capture_remaining_prod_state.sql`
 * and `server/routers/checkin.schemas.ts`'s `ProgramaSlug`). Do NOT add/remove
 * values here to "fix" MYT-131 (gh #131) without a matching migration that
 * moves `announcement_audiences.programs` to the same text+catalog pattern —
 * editing only this array would accept slugs the DB still rejects (42804).
 */
export const ANNOUNCEMENT_PROGRAMS = [
  "comedor",
  "familia",
  "formacion",
  "atencion_juridica",
  "voluntariado",
  "acompanamiento",
] as const;
export type AnnouncementProgram = (typeof ANNOUNCEMENT_PROGRAMS)[number];

/**
 * One audience targeting rule. Empty `roles` = "any role"; empty `programs` = "any program".
 * A user matches the rule when:
 *   (cardinality(roles)=0 OR userRole IN roles)
 *   AND (cardinality(programs)=0 OR userPrograms ∩ programs ≠ ∅)
 */
export interface AudienceRule {
  roles: readonly AnnouncementRole[];
  programs: readonly AnnouncementProgram[];
}

export function isLegacyTipo(t: string): boolean {
  return (LEGACY_ANNOUNCEMENT_TYPES as readonly string[]).includes(t);
}

export function isCurrentTipo(t: string): t is TipoAnnouncement {
  return (ANNOUNCEMENT_TYPES as readonly string[]).includes(t);
}
