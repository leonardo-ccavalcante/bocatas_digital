/**
 * programs.sessionClose.ts — Shared close-validation and session-data sanitization.
 *
 * Extracted from programs.sessions.ts so that BOTH cerrarSesion (staff-authed)
 * and enlaceCerrar (public token-gated) run the identical validation path.
 * ADR-0013: no business-critical validation may live only on the public surface.
 *
 * GROUP 2 fix: validateCloseData is now imported by both router files.
 * GROUP 7a fix: empty arrays and whitespace-only strings treated as missing.
 */
import { TRPCError } from "@trpc/server";
import type { SessionCloseConfig } from "../../shared/sessionSchemas";
import type { createAdminClient } from "../../client/src/lib/supabase/server";

type Supabase = ReturnType<typeof createAdminClient>;

/**
 * Validates session_data against the program's close config.
 * Returns an array of human-readable missing items (empty = valid).
 *
 * GROUP 7a: Treats [] and whitespace-only strings as "not provided"
 * for obligatorio fields.
 */
export function validateCloseData(
  config: SessionCloseConfig,
  sessionData: Record<string, unknown> | null,
  presentUploadSlugs: string[]
): string[] {
  if (!config.enabled) return [];
  const data = sessionData ?? {};
  const missing: string[] = [];

  if (config.tema_obligatorio) {
    const tema = data["tema"];
    if (!tema || (typeof tema === "string" && tema.trim() === "")) {
      missing.push("tema (campo requerido)");
    }
  }

  for (const field of config.fields) {
    if (!field.obligatorio) continue;
    const value = data[field.slug];
    if (
      value === undefined ||
      value === null ||
      (typeof value === "string" && value.trim() === "") ||
      (Array.isArray(value) && value.length === 0)
    ) {
      missing.push(`${field.label} (campo requerido)`);
    }
  }

  for (const upload of config.uploads) {
    if (!upload.obligatorio) continue;
    if (!presentUploadSlugs.includes(upload.slug)) {
      missing.push(`${upload.label} (documento requerido)`);
    }
  }

  return missing;
}

/**
 * Strips session_data keys that are not declared in the close config, then
 * validates each remaining value against its declared tipo.
 *
 * Security-critical for the public enlaceCerrar endpoint — arbitrary blobs
 * from the teacher's device must never be persisted to the DB.
 *
 * RESIDUAL 4(a): per-tipo coercion/validation rejects malformed values:
 *   numero/kg → finite number; contagem_personas → non-negative integer;
 *   texto → string, max 5000 chars; lista_voluntarios → string[], each max 200 chars.
 * RESIDUAL 4(b): 'tema' is always allowed regardless of tema_obligatorio to
 *   prevent data loss when the teacher fills an optional topic field.
 */
export function whitelistSessionData(
  config: SessionCloseConfig,
  sessionData: Record<string, unknown>
): Record<string, unknown> {
  if (!config.enabled) return {};
  const allowed = new Set(config.fields.map((f) => f.slug));
  // RESIDUAL 4(b): always keep tema — drop only when config.enabled=false (above)
  allowed.add("tema");

  // Build slug → tipo map for per-field validation
  const tipoMap = new Map(config.fields.map((f) => [f.slug, f.tipo]));

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(sessionData)) {
    if (!allowed.has(key)) continue;
    if (value === null || value === undefined) {
      result[key] = value;
      continue;
    }

    const tipo = tipoMap.get(key); // undefined for "tema" and any unlisted-but-allowed key
    if (tipo === "numero" || tipo === "kg") {
      // RESIDUAL 4(a): must be a finite number — reject oversized strings disguised as numbers
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Campo '${key}': se esperaba un número finito`,
        });
      }
    } else if (tipo === "contagem_personas") {
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Campo '${key}': se esperaba un entero no negativo`,
        });
      }
    } else if (tipo === "lista_voluntarios") {
      if (!Array.isArray(value)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Campo '${key}': se esperaba una lista`,
        });
      }
      const MAX_ITEM = 200;
      for (const item of value) {
        if (typeof item !== "string" || item.length > MAX_ITEM) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Campo '${key}': cada elemento debe ser texto (máx ${MAX_ITEM} chars)`,
          });
        }
      }
    } else {
      // tipo === "texto" OR tema (no tipo) → string with max 5000 chars
      const MAX_LEN = 5000;
      if (typeof value !== "string") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Campo '${key}': se esperaba texto`,
        });
      }
      if (value.length > MAX_LEN) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Campo '${key}': excede la longitud máxima de ${MAX_LEN} caracteres`,
        });
      }
    }
    result[key] = value;
  }
  return result;
}

/**
 * Fetches the tipo_slug values of existing session_documents for a session.
 * Used by validateCloseData callers to supply presentUploadSlugs.
 */
export async function fetchPresentUploadSlugs(
  supabase: Supabase,
  sessionId: string
): Promise<string[]> {
  const { data } = await supabase
    .from("session_documents")
    .select("tipo_slug")
    .eq("session_id", sessionId);
  return (data ?? []).map((d) => d.tipo_slug);
}

/**
 * Loads and parses the close config for a program.
 * Falls back to disabled config if null or invalid.
 */
export async function loadCloseConfig(
  supabase: Supabase,
  programId: string
): Promise<SessionCloseConfig> {
  const { data } = await supabase
    .from("programs")
    .select("session_close_config")
    .eq("id", programId)
    .single();

  const { SessionCloseConfigSchema } = await import("../../shared/sessionSchemas");
  const result = SessionCloseConfigSchema.safeParse(
    data?.session_close_config ?? { enabled: false, fields: [], uploads: [] }
  );
  if (result.success) return result.data;
  return { enabled: false, fields: [], uploads: [], tema_obligatorio: false };
}

/**
 * Validates and whitelists session_data for a program close operation.
 * Throws BAD_REQUEST listing missing obligatorio fields/tema/uploads.
 * Used by cerrarSesion AND enlaceCerrar — identical path (GROUP 2 fix).
 */
export async function enforceCloseValidation(
  supabase: Supabase,
  programId: string,
  sessionId: string,
  sessionData: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const config = await loadCloseConfig(supabase, programId);
  const sanitized = whitelistSessionData(config, sessionData);
  const presentSlugs = await fetchPresentUploadSlugs(supabase, sessionId);
  const missing = validateCloseData(config, sanitized, presentSlugs);
  if (missing.length > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Faltan datos obligatorios: ${missing.join("; ")}`,
    });
  }
  return sanitized;
}
