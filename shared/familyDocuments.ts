/**
 * Single source of truth mapping families-program document types to the
 * denormalized boolean cache columns on the `families` table.
 *
 * Used by both client (UI status derivation) and server (router mutations)
 * to keep the cache in sync with the actual upload state.
 *
 * Docs without a cache column (libro_familia, autorizacion_recogida,
 * justificante_situacion may be null) are status-derived purely from
 * `family_member_documents` row presence.
 */

export type FamilyDocType =
  | "padron_municipal"
  | "justificante_situacion"
  | "informe_social"
  | "autorizacion_recogida"
  | "documento_identidad"
  | "consent_bocatas"
  | "consent_banco_alimentos";

/** Boolean cache columns on the `families` table. */
export type FamilyBooleanCacheColumn =
  | "padron_recibido"
  | "justificante_recibido"
  | "informe_social"
  | "docs_identidad"
  | "consent_bocatas"
  | "consent_banco_alimentos";

/**
 * For each doc type, which boolean column on `families` mirrors its status.
 * `null` means the doc has no cache column — UI derives status from
 * `family_member_documents` row presence directly.
 */
export const FAMILY_DOC_TO_BOOLEAN_COLUMN: Record<FamilyDocType, FamilyBooleanCacheColumn | null> = {
  padron_municipal: "padron_recibido",
  justificante_situacion: "justificante_recibido",
  informe_social: "informe_social",
  autorizacion_recogida: null,
  documento_identidad: "docs_identidad",
  consent_bocatas: "consent_bocatas",
  consent_banco_alimentos: "consent_banco_alimentos",
};

/**
 * Doc types that live at the family level (one per family — `member_index = -1`).
 */
export const FAMILY_LEVEL_DOC_TYPES = [
  "padron_municipal",
  "justificante_situacion",
  "informe_social",
  "autorizacion_recogida",
] as const satisfies readonly FamilyDocType[];

/**
 * Doc types that live per-member (one row per member ≥14 — `member_index ≥ 0`).
 * The boolean cache for these reflects EXISTS(any uploaded for any member).
 */
export const PER_MEMBER_DOC_TYPES = [
  "documento_identidad",
  "consent_bocatas",
  "consent_banco_alimentos",
] as const satisfies readonly FamilyDocType[];

export function isFamilyLevelDocType(t: FamilyDocType): boolean {
  return (FAMILY_LEVEL_DOC_TYPES as readonly string[]).includes(t);
}

export function isPerMemberDocType(t: FamilyDocType): boolean {
  return (PER_MEMBER_DOC_TYPES as readonly string[]).includes(t);
}
