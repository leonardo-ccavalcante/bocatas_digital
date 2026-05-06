import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { logProcedureError } from "../../_core/logging-middleware";
import type { TrpcContext } from "../../_core/context";
import type { Database } from "../../../client/src/lib/database.types";
import {
  FAMILY_LEVEL_DOC_TYPES,
  PER_MEMBER_DOC_TYPES,
} from "@shared/familyDocuments";

export const uuidLike = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Invalid UUID format");

export const SENTINEL_UUID = "00000000-0000-0000-0000-000000000000";

/**
 * program_id input validator that rejects the all-zero sentinel UUID.
 * IntakeWizard historically defaulted to the sentinel before a Programa-selection step
 * existed; FK violations made the form unusable. This guard surfaces the missing program
 * with a clear message so the UI follow-up (add Programa step) is unambiguous.
 */
export const programIdSchema = uuidLike.refine(
  (v) => v !== SENTINEL_UUID,
  { message: "Programa requerido: seleccione un programa antes de registrar la familia" }
);

// ─── Member-Resolution Helpers ──────────────────────────────────────────────

/**
 * Resolve a member to a real `person_id`:
 *   - If `member.person_id` is set, return it (caller is responsible for ensuring it exists).
 *   - Otherwise, try a duplicate match on (nombre + apellidos + fecha_nacimiento) — exact match only.
 *     Fuzzy/trigram dedup is Gate 2.
 *   - If no match, INSERT a new persons row with canal_llegada = 'programa_familias' (familia intake).
 * Returns the resolved `person_id`.
 */
export async function resolveMemberPersonId(
  db: ReturnType<typeof createAdminClient>,
  member: {
    nombre: string;
    apellidos: string;
    fecha_nacimiento?: string;
    documento?: string;
    person_id?: string | null;
  }
): Promise<string> {
  if (member.person_id) return member.person_id;

  // Exact-match dedup on name + birth date.
  if (member.fecha_nacimiento) {
    const { data: existing } = await db
      .from("persons")
      .select("id")
      .eq("nombre", member.nombre)
      .eq("apellidos", member.apellidos)
      .eq("fecha_nacimiento", member.fecha_nacimiento)
      .is("deleted_at", null)
      .limit(1);
    if (existing && existing.length > 0) return existing[0].id;
  }

  // Insert a new person row for this family member.
  const { data: created, error } = await db
    .from("persons")
    .insert({
      nombre: member.nombre,
      apellidos: member.apellidos,
      fecha_nacimiento: member.fecha_nacimiento ?? null,
      numero_documento: member.documento ?? null,
      canal_llegada: "programa_familias",
      idioma_principal: "es",
    })
    .select("id")
    .single();
  if (error || !created) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: error?.message ?? "Failed to create person row for family member",
    });
  }
  return created.id;
}

/**
 * Idempotent insert of a `program_enrollments` row.
 * If an active enrollment already exists for (person_id, program_id), do nothing.
 */
export async function ensureFamiliaEnrollment(
  db: ReturnType<typeof createAdminClient>,
  person_id: string,
  program_id: string,
  family_id: string,
  member_index: number
): Promise<void> {
  const { data: existing } = await db
    .from("program_enrollments")
    .select("id")
    .eq("person_id", person_id)
    .eq("program_id", program_id)
    .eq("estado", "activo")
    .is("deleted_at", null)
    .limit(1);
  if (existing && existing.length > 0) return;

  await db.from("program_enrollments").insert({
    person_id,
    program_id,
    estado: "activo",
    metadata: { family_id, member_index },
  });
}

export const familyDocTypeSchema = z.enum([
  ...FAMILY_LEVEL_DOC_TYPES,
  ...PER_MEMBER_DOC_TYPES,
] as [string, ...string[]]);

export type FamiliesUpdate = Database["public"]["Tables"]["families"]["Update"];

// ─── Input Schemas ─────────────────────────────────────────────────────────

export const FamilyMemberSchema = z.object({
  nombre: z.string().min(1).max(100),
  apellidos: z.string().min(1).max(100),
  parentesco: z.enum(["esposo_a", "hijo_a", "madre", "padre", "suegro_a", "hermano_a", "abuelo_a", "otro"]),
  fecha_nacimiento: z.string().optional(),
  documento: z.string().optional(),
  person_id: uuidLike.optional(),
});

// Normalize input parentesco/relacion to a value the familia_miembros.relacion
// CHECK constraint accepts. As of migration 20260505000003 the constraint
// accepts both English vocab (parent/child/sibling/other) and Spanish
// parentesco vocab (esposo_a, hijo_a, madre, padre, suegro_a, hermano_a,
// abuelo_a, otro). Pass-through for known values; unknown -> 'other'.
const VALID_RELACION_VALUES = new Set([
  "parent", "child", "sibling", "other",
  "esposo_a", "hijo_a", "madre", "padre",
  "suegro_a", "hermano_a", "abuelo_a", "otro",
]);

export function mapParentescoToRelacion(parentesco?: string | null): string {
  if (parentesco && VALID_RELACION_VALUES.has(parentesco)) {
    return parentesco;
  }
  return "other";
}

// Mirror family members from JSON write paths into the relational
// familia_miembros table so families.getById (table-based) sees them.
// Logs but does not throw on failure: JSON column is the source-of-truth
// backup until Phase 5.1 cleanup drops it.
export type MirrorMember = {
  nombre: string;
  apellidos: string;
  fecha_nacimiento?: string | null;
  documento?: string | null;
  person_id?: string | null;
  parentesco?: string | null;
};

export async function mirrorMembersToTable(
  db: ReturnType<typeof createAdminClient>,
  ctx: TrpcContext,
  familyId: string,
  miembros: MirrorMember[]
): Promise<void> {
  if (miembros.length === 0) return;
  const rows = miembros.map((m) => ({
    familia_id: familyId,
    nombre: m.nombre,
    apellidos: m.apellidos,
    fecha_nacimiento: m.fecha_nacimiento ?? null,
    documento: m.documento ?? null,
    person_id: m.person_id ?? null,
    rol: "dependent" as const,
    relacion: mapParentescoToRelacion(m.parentesco),
    estado: "activo" as const,
  }));
  const { error } = await db.from("familia_miembros").insert(rows);
  if (error) {
    logProcedureError(ctx, "Failed to mirror members to familia_miembros", error as unknown as Error, {
      familyId,
      numMiembros: miembros.length,
    });
  }
}

// Insert a row into `families` with shared error handling. Two procedures use this:
// families.create (full intake payload, adminProcedure) and persons.createFamily
// (minimal payload, protectedProcedure). Both want the 23505 -> CONFLICT mapping.
type FamiliesInsertPayload = Database["public"]["Tables"]["families"]["Insert"];
type FamiliesRow = Database["public"]["Tables"]["families"]["Row"];

export async function insertFamilyRow(
  db: ReturnType<typeof createAdminClient>,
  ctx: TrpcContext,
  payload: FamiliesInsertPayload,
  logMetadata?: Record<string, unknown>
): Promise<FamiliesRow> {
  const { data, error } = await db.from("families").insert([payload]).select().single();
  if (error || !data) {
    logProcedureError(
      ctx,
      "Failed to create family row",
      (error ?? new Error("Unknown error")) as Error,
      logMetadata
    );
    if (error?.code === "23505") {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Esta persona ya es titular de una familia activa",
      });
    }
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: error?.message ?? "Failed to create family",
    });
  }
  return data;
}

export const DeactivateFamilyInputSchema = z
  .object({
    id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
    motivo_baja: z.enum([
      "no_recogida_consecutiva",
      "voluntaria",
      "fraude",
      "cambio_circunstancias",
      "otros",
    ]),
    fecha_baja: z.string(),
    otros_detalle: z.string().min(1).optional(),
  })
  .refine((data) => data.motivo_baja !== "otros" || Boolean(data.otros_detalle), {
    message: "Debe especificar el motivo",
    path: ["otros_detalle"],
  });
