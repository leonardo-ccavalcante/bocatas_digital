/**
 * checkin.schemas.ts — input validators for the check-in router, extracted to
 * keep checkin.ts under the max-lines gate.
 */
import { z } from "zod";

/** UUID-like validator that accepts any 8-4-4-4-12 hex string (including synthetic seed IDs). */
export const uuidLike = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "Invalid UUID format"
);

/**
 * `attendances.programa` is text + FK to programs.slug, so any catalog slug is
 * valid — including programs created via the admin UI after this deploy. Format
 * MUST match the slug rule in programs.ts (digits included — edition slugs carry
 * a year); existence is enforced by the FK (23503 → BAD_REQUEST in the router).
 * Never reintroduce a hardcoded slug enum here.
 */
export const ProgramaSlug = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9_]+$/, "Identificador de programa inválido");

export const MetodoEnum = z.enum(["qr_scan", "manual_busqueda", "conteo_anonimo"]);
