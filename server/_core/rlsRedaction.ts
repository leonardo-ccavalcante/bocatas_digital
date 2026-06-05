/**
 * rlsRedaction.ts — Defense-in-depth field redaction for high-risk PII.
 *
 * EIPD principle: voluntarios (role !== 'admin' | 'superadmin') must NOT
 * receive these high-risk fields:
 *   - situacion_legal      (legal status — sensitive)
 *   - recorrido_migratorio (migration history — sensitive)
 *   - foto_documento_url   (document photo — high-risk)
 *
 * RLS policies in PostgreSQL are the primary defense; this helper provides
 * an application-layer guarantee that the same redaction is applied
 * consistently across every router that returns persons- or families-shaped
 * rows. Place this redaction at the procedure boundary (before returning
 * data to the client).
 *
 * Pattern source:
 *   - server/routers/persons.ts (getById)
 *   - server/routers/families/crud.ts (getById)
 */

const HIGH_RISK_FIELDS = [
  "situacion_legal",
  "recorrido_migratorio",
  "foto_documento_url",
  // Family social-report narrative (INFORMES SOCIALES). GDPR Art. 9 — admin/
  // superadmin only. Applied wherever a families row is returned (e.g.
  // families/crud.ts getById). NOTE: verify list paths also redact.
  "situacion_familiar_texto",
  "necesidades_texto",
] as const;

const ELEVATED_ROLES = new Set(["admin", "superadmin"]);

/**
 * The shared elevated-role test (admin | superadmin). Single source of truth
 * for "is this caller privileged", used by `redactHighRiskFields` (which gates
 * only the high-risk trio above) AND by routers that gate other PII per role —
 * e.g. families.getById narrows the titular contact-PII select and strips
 * member documento. This function decides the role; each caller decides which
 * fields that role may see.
 */
export function isElevatedRole(role: string | undefined | null): boolean {
  return role !== undefined && role !== null && ELEVATED_ROLES.has(role);
}

/**
 * Strip the high-risk PII fields from a single row when the caller's role
 * is not elevated (admin or superadmin). The function is generic over the
 * row shape so callers preserve their concrete row type at the call site.
 *
 * Returns:
 *   - `null` unchanged when row is null
 *   - the row unchanged when role is admin/superadmin
 *   - a new object with the high-risk fields removed otherwise
 *
 * The helper never mutates the input.
 */
export function redactHighRiskFields<T extends Record<string, unknown>>(
  role: string | undefined | null,
  row: T
): T;
export function redactHighRiskFields<T extends Record<string, unknown>>(
  role: string | undefined | null,
  row: null
): null;
export function redactHighRiskFields<T extends Record<string, unknown>>(
  role: string | undefined | null,
  row: T | null
): T | null;
export function redactHighRiskFields<T extends Record<string, unknown>>(
  role: string | undefined | null,
  row: T | null
): T | null {
  if (row === null) return null;
  if (isElevatedRole(role)) return row;

  const redacted: Record<string, unknown> = { ...row };
  for (const field of HIGH_RISK_FIELDS) {
    delete redacted[field];
  }
  return redacted as T;
}

/**
 * Apply `redactHighRiskFields` to every row in an array. Preserves array
 * order and never mutates input rows.
 */
export function redactHighRiskFieldsArray<T extends Record<string, unknown>>(
  role: string | undefined | null,
  rows: readonly T[]
): T[] {
  if (isElevatedRole(role)) return [...rows];
  return rows.map((row) => redactHighRiskFields(role, row));
}

export const HIGH_RISK_FIELD_NAMES = HIGH_RISK_FIELDS;
