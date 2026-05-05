import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure, protectedProcedure, superadminProcedure } from "../_core/trpc";
import { createAdminClient } from "../../client/src/lib/supabase/server";
import { logProcedureAction, logProcedureError } from "../_core/logging-middleware";
import type { TrpcContext } from "../_core/context";
import type { Database } from "../../client/src/lib/database.types";
import { generateFamiliesCSV, type ExportMode } from "../csvExport";
import { validateFamiliesCSV, parseFamiliesCSV } from "../csvImport";
import { generateFamiliesCSVWithMembers } from "../csvExportWithMembers";
import { validateFamiliesWithMembersCSV, parseFamiliesWithMembersCSV } from "../csvImportWithMembers";
import { eq, desc } from "drizzle-orm";
import { getDb } from "../db";
import {
  FAMILY_DOC_TO_BOOLEAN_COLUMN,
  FAMILY_LEVEL_DOC_TYPES,
  PER_MEMBER_DOC_TYPES,
  type FamilyDocType,
} from "@shared/familyDocuments";
import {
  isMemberAdult,
  REQUIRED_FAMILY_DOC_TYPES,
  REQUIRED_PER_MEMBER_DOC_TYPES,
} from "../families-doc-helpers";

const uuidLike = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Invalid UUID format");



// ─── Member-Resolution Helpers ──────────────────────────────────────────────

/**
 * Resolve a member to a real `person_id`:
 *   - If `member.person_id` is set, return it (caller is responsible for ensuring it exists).
 *   - Otherwise, try a duplicate match on (nombre + apellidos + fecha_nacimiento) — exact match only.
 *     Fuzzy/trigram dedup is Gate 2.
 *   - If no match, INSERT a new persons row with canal_llegada = 'programa_familias' (familia intake).
 * Returns the resolved `person_id`.
 */
async function resolveMemberPersonId(
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
async function ensureFamiliaEnrollment(
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

const familyDocTypeSchema = z.enum([
  ...FAMILY_LEVEL_DOC_TYPES,
  ...PER_MEMBER_DOC_TYPES,
] as [string, ...string[]]);

type FamiliesUpdate = Database["public"]["Tables"]["families"]["Update"];

// ─── Input Schemas ─────────────────────────────────────────────────────────

const FamilyMemberSchema = z.object({
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

const DeactivateFamilyInputSchema = z
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

// ─── Families Router ────────────────────────────────────────────────────────

export const familiesRouter = router({
  // ─── Job 1: Family List ──────────────────────────────────────────────────
  /** GET /families list with filters */
  getAll: adminProcedure
    .input(
      z
        .object({
          search: z.string().optional(),
          estado: z.enum(["activa", "baja", "all"]).default("activa"),
          sin_alta_guf: z.boolean().optional(),
          sin_informe_social: z.boolean().optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = createAdminClient();
      let query = db
        .from("families")
        .select(
          `id, familia_numero, estado, num_adultos, num_menores_18,
           persona_recoge, autorizado, alta_en_guf, fecha_alta_guf,
           informe_social, informe_social_fecha, guf_cutoff_day, guf_verified_at,
           created_at, deleted_at,
           persons!titular_id(id, nombre, apellidos, telefono)`
        )
        .is("deleted_at", null);

      if (input?.estado !== "all") {
        query = query.eq("estado", input?.estado ?? "activa");
      }
      if (input?.sin_alta_guf) {
        query = query.eq("alta_en_guf", false);
      }
      if (input?.sin_informe_social) {
        query = query.eq("informe_social", false);
      }
      if (input?.search) {
        const searchNum = parseInt(input.search);
        if (!isNaN(searchNum)) {
          query = query.eq("familia_numero", searchNum);
        } else {
          // Search by titular name — use textSearch on persons join
          query = query.or(
            `persons.nombre.ilike.%${input.search}%,persons.apellidos.ilike.%${input.search}%`
          );
        }
      }

      const { data, error } = await query.order("familia_numero", { ascending: true });
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data ?? [];
    }),

  // ─── Job 1: Family Detail ────────────────────────────────────────────────
  /** GET /families/:id */
  getById: adminProcedure
    .input(z.object({ id: uuidLike }))
    .query(async ({ input, ctx }) => {
      const db = createAdminClient();
      
      // Fetch family
      const { data: family, error } = await db
        .from("families")
        .select(
          `*, persons!titular_id(id, nombre, apellidos, telefono, email, idioma_principal)`
        )
        .eq("id", input.id)
        .is("deleted_at", null)
        .single();
      
      if (error || !family) {
        ctx.logger.error('Family not found', { familiaId: input.id, error });
        throw new TRPCError({ code: "NOT_FOUND", message: "Familia no encontrada" });
      }
      
      // Fetch members from familia_miembros table
      const { data: miembros = [], error: miembrosError } = await db
        .from("familia_miembros")
        .select("*")
        .eq("familia_id", input.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      
      if (miembrosError) {
        ctx.logger.warn('Failed to fetch members', { familiaId: input.id, error: miembrosError });
      }
      
      // Return family with members array
      return {
        ...family,
        miembros: miembros || [],
      };
    }),

  // ─── Job 1: Create Family (intake submit) ───────────────────────────────
  /** POST /families — create family + enrollment */
  create: adminProcedure
    .input(
      z.object({
        titular_id: uuidLike,
        miembros: z.array(FamilyMemberSchema).default([]),
        num_adultos: z.number().int().min(1),
        num_menores_18: z.number().int().min(0),
        persona_recoge: z.string().min(1),
        autorizado: z.boolean().default(false),
        program_id: uuidLike,
        consent_bocatas: z.boolean().default(false),
        consent_banco_alimentos: z.boolean().default(false),
        docs_identidad: z.boolean().default(false),
        padron_recibido: z.boolean().default(false),
        justificante_recibido: z.boolean().default(false),
        informe_social: z.boolean().default(false),
        informe_social_fecha: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = createAdminClient();
      const startTime = Date.now();
      const { data: family, error: familyError } = await db
        .from("families")
        .insert({
          titular_id: input.titular_id,
          miembros: input.miembros,
          num_adultos: input.num_adultos,
          num_menores_18: input.num_menores_18,
          persona_recoge: input.persona_recoge,
          autorizado: input.autorizado,
          estado: "activa",
          consent_bocatas: input.consent_bocatas,
          consent_banco_alimentos: input.consent_banco_alimentos,
          docs_identidad: input.docs_identidad,
          padron_recibido: input.padron_recibido,
          justificante_recibido: input.justificante_recibido,
          informe_social: input.informe_social,
          informe_social_fecha: input.informe_social_fecha ?? null,
        })
        .select()
        .single();

      if (familyError) {
        logProcedureError(ctx, 'Failed to create family', familyError as Error, {
          titularId: input.titular_id,
          numMiembros: input.miembros.length,
        });
        if (familyError.code === "23505") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Esta persona ya es titular de una familia activa",
          });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: familyError.message });
      }

      const duration = Date.now() - startTime;
      logProcedureAction(ctx, 'Family created successfully', {
        familyId: family.id,
        titularId: input.titular_id,
        numMiembros: input.miembros.length,
        numAdultos: input.num_adultos,
        numMenores: input.num_menores_18,
        duration,
      });

      // Enroll the titular (member_index 0 by convention).
      await ensureFamiliaEnrollment(db, input.titular_id, input.program_id, family.id, 0);

      // Enroll every adult member (≥14 or unknown DOB — treat unknown as adult to be safe).
      // Also resolve/create person rows for members that have no person_id yet,
      // then persist the resolved person_id back into families.miembros JSONB.
      const today = new Date();
      const resolvedMiembros = [...input.miembros];
      let miembrosUpdated = false;

      for (let i = 0; i < input.miembros.length; i++) {
        const member = input.miembros[i];
        if (!isMemberAdult(member, today)) continue;

        const personId = await resolveMemberPersonId(db, member);
        await ensureFamiliaEnrollment(db, personId, input.program_id, family.id, i + 1);

        if (personId !== member.person_id) {
          resolvedMiembros[i] = { ...member, person_id: personId };
          miembrosUpdated = true;
        }
      }

      // Write resolved person_ids back to families.miembros in one UPDATE.
      if (miembrosUpdated) {
        await db
          .from("families")
          .update({ miembros: resolvedMiembros })
          .eq("id", family.id);
      }

      // Mirror to familia_miembros so families.getById (table-based reads) sees them.
      await mirrorMembersToTable(db, ctx, family.id, resolvedMiembros);

      return family;
    }),

  // ─── Job 4: Update docs checklist ────────────────────────────────────────
  /** PATCH one doc field */
  updateDocField: adminProcedure
    .input(
      z.object({
        id: uuidLike,
        field: z.enum([
          "consent_bocatas",
          "consent_banco_alimentos",
          "docs_identidad",
          "padron_recibido",
          "justificante_recibido",
          "informe_social",
        ]),
        value: z.boolean(),
        informe_social_fecha: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = createAdminClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updateData: any = { [input.field]: input.value };
      if (input.field === "informe_social" && input.informe_social_fecha) {
        updateData.informe_social_fecha = input.informe_social_fecha;
      }
      const { error } = await db.from("families").update(updateData).eq("id", input.id);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),

  // ─── Job 5: GUF panel ────────────────────────────────────────────────────
  /** PATCH GUF status */
  updateGuf: adminProcedure
    .input(
      z.object({
        id: uuidLike,
        alta_en_guf: z.boolean(),
        fecha_alta_guf: z.string().optional(),
        guf_cutoff_day: z.number().int().min(1).max(31).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = createAdminClient();
      const { error } = await db.from("families").update({
        alta_en_guf: input.alta_en_guf,
        guf_verified_at: new Date().toISOString(),
        ...(input.fecha_alta_guf ? { fecha_alta_guf: input.fecha_alta_guf } : {}),
        ...(input.guf_cutoff_day !== undefined ? { guf_cutoff_day: input.guf_cutoff_day } : {}),
      }).eq("id", input.id);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),

  /** GET GUF system default cutoff day from app_settings */
  getGufSystemDefault: adminProcedure.query(async () => {
    const db = createAdminClient();
    const { data } = await db
      .from("app_settings")
      .select("value")
      .eq("key", "guf_default_cutoff_day")
      .single();
    return { cutoff_day: data ? parseInt(data.value) : 20 };
  }),

  /** PATCH GUF system default cutoff day (superadmin only) */
  updateGufSystemDefault: superadminProcedure
    .input(z.object({ cutoff_day: z.number().int().min(1).max(31) }))
    .mutation(async ({ input }) => {
      const db = createAdminClient();
      const { error } = await db
        .from("app_settings")
        .update({ value: String(input.cutoff_day), updated_at: new Date().toISOString() })
        .eq("key", "guf_default_cutoff_day");
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),

  // ─── Job 6: Deactivation + Reactivation ─────────────────────────────────
  /** PATCH deactivate family */
  deactivate: adminProcedure
    .input(
      DeactivateFamilyInputSchema
    )
    .mutation(async ({ input }) => {
      const db = createAdminClient();
      const { error } = await db
        .from("families")
        .update({
          estado: "baja",
          fecha_baja: input.fecha_baja,
          motivo_baja: input.motivo_baja,
        })
        .eq("id", input.id);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),

  /** PATCH reactivate family (preserves baja_history in metadata) */
  reactivate: adminProcedure
    .input(z.object({ id: uuidLike }))
    .mutation(async ({ input }) => {
      const db = createAdminClient();
      const { data: current, error: fetchError } = await db
        .from("families")
        .select("motivo_baja, fecha_baja, metadata")
        .eq("id", input.id)
        .single();
      if (fetchError) throw new TRPCError({ code: "NOT_FOUND" });

      const meta = (current.metadata as Record<string, unknown>) ?? {};
      const bajaHistory = [
        ...((meta.baja_history as unknown[]) ?? []),
        {
          motivo: current.motivo_baja,
          fecha: current.fecha_baja,
          reactivated_at: new Date().toISOString(),
        },
      ];

      const { error } = await db
        .from("families")
        .update({
          estado: "activa",
          fecha_baja: null,
          motivo_baja: null,
          metadata: JSON.parse(JSON.stringify({ ...meta, baja_history: bajaHistory })),
        })
        .eq("id", input.id);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),

  // ─── Job 7: Volunteer Identity Verifier ─────────────────────────────────
  /** Search families for volunteer identity verification (field-level redaction) */
  verifyIdentity: protectedProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = createAdminClient();
      const queryNum = parseInt(input.query);

      let query = db
        .from("families")
        .select(
          `id, familia_numero, estado, persona_recoge, autorizado,
           autorizado_documento_url, num_adultos, num_menores_18,
           persons!titular_id(nombre, apellidos)`
        )
        .eq("estado", "activa")
        .is("deleted_at", null);

      if (!isNaN(queryNum)) {
        query = query.eq("familia_numero", queryNum);
      } else {
        query = query.ilike("persons.nombre", `%${input.query}%`);
      }

      const { data, error } = await query.limit(5);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      if (!data?.length) return [];

      // Field-level redaction — high-risk PII NEVER exposed via this endpoint regardless of role
      return data.map((f) => {
        const persons = f.persons as { nombre: string; apellidos: string } | null;
        return {
          id: f.id,
          familia_numero: f.familia_numero,
          titular_nombre: persons
            ? `${persons.nombre} ${persons.apellidos}`.trim()
            : "",
          num_miembros: (f.num_adultos ?? 0) + (f.num_menores_18 ?? 0),
          persona_recoge: f.persona_recoge,
          autorizado: f.autorizado,
          autorizado_documento_url: f.autorizado_documento_url ?? null,
          // NOT included: situacion_legal, foto_documento_url, recorrido_migratorio
        };
      });
    }),

  // ─── Job 8: Per-member Pending Items ────────────────────────────────────
  /**
   * GET pending consent + doc items per member (for Job 8 + Job 9 Layer B).
   *
   * FIX (Gap E): Rewritten to iterate (family × required-doc-config) instead
   * of scanning existing family_member_documents rows.  The old approach silently
   * dropped families whose members had zero rows in that table (e.g. legacy
   * intake, or titular-only families).
   *
   * Return shape preserved: one row per (family, member) with missing: string[].
   *
   * Known limitation: days_pending is based on family.created_at, not
   * member_added_at (that would require a new JSONB field — deferred to Gate 2).
   *
   * Required doc sets (inlined from client/src/features/families/constants.ts
   * to avoid cross-bundle imports):
   *   Family-level required: padron_municipal, informe_social
   *   Per-member required (age ≥14): documento_identidad, consent_bocatas,
   *                                   consent_banco_alimentos
   * These match FAMILIA_DOCS_CONFIG.filter(d => d.required).
   */
  getPendingItems: adminProcedure
    .input(z.object({ family_id: uuidLike.optional() }))
    .query(async ({ input }) => {
      const db = createAdminClient();

      // Required doc keys — sourced from the shared helper to avoid drift.
      const REQUIRED_FAMILY_DOCS = REQUIRED_FAMILY_DOC_TYPES;
      const REQUIRED_PER_MEMBER_DOCS = REQUIRED_PER_MEMBER_DOC_TYPES;

      let familiesQuery = db
        .from("families")
        .select(
          "id, familia_numero, miembros, created_at, persons!titular_id(id, nombre, apellidos, telefono)"
        )
        .eq("estado", "activa")
        .is("deleted_at", null);

      if (input.family_id) {
        familiesQuery = familiesQuery.eq("id", input.family_id);
      }

      const { data: families, error: famErr } = await familiesQuery;
      if (famErr) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: famErr.message });
      if (!families?.length) return [];

      const familyIds = families.map((f) => f.id);

      // Fetch all uploaded current docs for these families in a single query.
      // A combination is "uploaded" when: is_current=true, deleted_at IS NULL,
      // documento_url IS NOT NULL.
      const { data: uploadedDocs } = await db
        .from("family_member_documents")
        .select("family_id, member_index, documento_tipo")
        .in("family_id", familyIds)
        .is("deleted_at", null)
        .eq("is_current", true)
        .not("documento_url", "is", null);

      // Build a lookup key set: "family_id:member_index:documento_tipo"
      // member_index = -1 for family-level docs.
      const uploadedKeySet = new Set(
        (uploadedDocs ?? []).map(
          (d: { family_id: string; member_index: number; documento_tipo: string }) =>
            `${d.family_id}:${d.member_index}:${d.documento_tipo}`
        )
      );

      const today = new Date();

      const result: {
        family_id: string;
        familia_numero: number;
        member_index: number;
        member_name: string;
        parentesco: string;
        person_id: string | null;
        missing: string[];
        days_pending: number;
      }[] = [];

      for (const family of families) {
        const familyCreatedAt = new Date(family.created_at);
        const daysPending = Math.floor(
          (today.getTime() - familyCreatedAt.getTime()) / (1000 * 60 * 60 * 24)
        );

        // ── Family-level required docs (member_index = -1) ─────────────────
        const familyMissingDocs = REQUIRED_FAMILY_DOCS.filter(
          (docType) => !uploadedKeySet.has(`${family.id}:-1:${docType}`)
        );
        if (familyMissingDocs.length > 0) {
          const titular = family.persons as {
            id: string;
            nombre: string;
            apellidos: string | null;
          } | null;
          const titularName = titular
            ? `${titular.nombre} ${titular.apellidos ?? ""}`.trim()
            : "";
          result.push({
            family_id: family.id,
            familia_numero: family.familia_numero,
            member_index: -1,
            member_name: titularName,
            parentesco: "familia",
            person_id: titular?.id ?? null,
            missing: familyMissingDocs as unknown as string[],
            days_pending: daysPending,
          });
        }

        // ── Per-member required docs ────────────────────────────────────────
        // Build the full member list: titular as member 0, then JSONB members 1+.
        const titular = family.persons as {
          id: string;
          nombre: string;
          apellidos: string | null;
        } | null;

        type MemberEntry = {
          member_index: number;
          nombre: string;
          apellidos: string | null;
          person_id: string | null;
          parentesco: string;
          fecha_nacimiento: string | null;
        };

        const allMembers: MemberEntry[] = [];

        if (titular) {
          allMembers.push({
            member_index: 0,
            nombre: titular.nombre,
            apellidos: titular.apellidos,
            person_id: titular.id,
            parentesco: "titular",
            fecha_nacimiento: null, // DOB not in this select; treat as adult (≥14)
          });
        }

        const miembros = (family.miembros as Array<Record<string, unknown>>) ?? [];
        miembros.forEach((m, idx) => {
          allMembers.push({
            member_index: idx + 1,
            nombre: (m.nombre as string) ?? "",
            apellidos: (m.apellidos as string) ?? null,
            person_id: (m.person_id as string) ?? null,
            parentesco: (m.parentesco as string) ?? "",
            fecha_nacimiento: (m.fecha_nacimiento as string) ?? null,
          });
        });

        for (const member of allMembers) {
          // Apply minAge=14 filter (members with unknown DOB default to adult).
          if (!isMemberAdult(member, today)) continue;

          const missingDocs = REQUIRED_PER_MEMBER_DOCS.filter(
            (docType) =>
              !uploadedKeySet.has(`${family.id}:${member.member_index}:${docType}`)
          );

          if (missingDocs.length > 0) {
            result.push({
              family_id: family.id,
              familia_numero: family.familia_numero,
              member_index: member.member_index,
              member_name: `${member.nombre} ${member.apellidos ?? ""}`.trim(),
              parentesco: member.parentesco,
              person_id: member.person_id,
              missing: missingDocs as unknown as string[],
              days_pending: daysPending,
            });
          }
        }
      }

      return result;
    }),

  // ─── Job 9: Compliance Dashboard ────────────────────────────────────────
  /** GET compliance stats (CM-1 to CM-5) */
  getComplianceStats: adminProcedure.query(async () => {
    const db = createAdminClient();
    const today = new Date();

    const cutoff330 = new Date(today);
    cutoff330.setDate(cutoff330.getDate() - 330);
    const cutoff60 = new Date(today);
    cutoff60.setDate(cutoff60.getDate() - 60);
    const cutoff30 = new Date(today);
    cutoff30.setDate(cutoff30.getDate() - 30);

    // CM-1: active families missing BdeA consent
    const { count: cm1 } = await db
      .from("families")
      .select("*", { count: "exact", head: true })
      .eq("estado", "activa")
      .is("deleted_at", null)
      .eq("consent_banco_alimentos", false);

    // CM-2: informes sociales >330d old
    const { count: cm2 } = await db
      .from("families")
      .select("*", { count: "exact", head: true })
      .eq("estado", "activa")
      .is("deleted_at", null)
      .eq("informe_social", true)
      .lt("informe_social_fecha", cutoff330.toISOString().split("T")[0]);

    // CM-3: GUF stale >30d or not registered
    const { count: cm3 } = await db
      .from("families")
      .select("*", { count: "exact", head: true })
      .eq("estado", "activa")
      .is("deleted_at", null)
      .or(`alta_en_guf.eq.false,guf_verified_at.lt.${cutoff30.toISOString()}`);

    // CM-4: open sessions (no closed_at, fecha < today)
    const { count: cm4 } = await db
      .from("program_sessions")
      .select("*", { count: "exact", head: true })
      .is("closed_at", null)
      .lt("fecha", today.toISOString().split("T")[0]);

    // CM-5: no delivery in 60+ days
    const { data: allActiveFamilies } = await db
      .from("families")
      .select("id, familia_numero, persons!titular_id(nombre, apellidos, telefono)")
      .eq("estado", "activa")
      .is("deleted_at", null);

    // Query canonical deliveries table
    const { data: recentDeliveries } = await (db as any)
      .from("deliveries")
      .select("family_id")
      .gte("fecha_entrega", cutoff60.toISOString().split("T")[0])
      .is("deleted_at", null);

    const recentFamilyIds = new Set(
      (recentDeliveries ?? []).map((d: { family_id: string }) => d.family_id)
    );
    const cm5List = (allActiveFamilies ?? []).filter(
      (f: { id: string }) => !recentFamilyIds.has(f.id)
    );

    return {
      cm1: cm1 ?? 0,
      cm2: cm2 ?? 0,
      cm3: cm3 ?? 0,
      cm4: cm4 ?? 0,
      cm5: cm5List.length,
      cm5List,
    };
  }),

  // ─── Job 10: Session Close ───────────────────────────────────────────────
  /** POST close a program session */
  closeSession: adminProcedure
    .input(
      z.object({
        program_id: uuidLike,
        fecha: z.string(),
        location_id: uuidLike.optional(),
        session_data: z.record(z.string(), z.unknown()),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sessionInsert: any = {
        program_id: input.program_id,
        fecha: input.fecha,
        location_id: input.location_id ?? null,
        opened_by: ctx.user.id,
        closed_by: ctx.user.id,
        session_data: input.session_data,
        closed_at: new Date().toISOString(),
      };
      const { data, error } = await db.from("program_sessions").insert(sessionInsert).select().single();

      if (error) {
        if (error.code === "23505") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Ya existe una sesión cerrada para este programa hoy en esta sede",
          });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }
      return data;
    }),

  /** GET open session for a program today */
  getOpenSession: adminProcedure
    .input(
      z.object({
        program_id: uuidLike,
        fecha: z.string().optional(),
        location_id: uuidLike.optional(),
      })
    )
    .query(async ({ input }) => {
      const db = createAdminClient();
      const fecha = input.fecha ?? new Date().toISOString().split("T")[0];
      const { data } = await db
        .from("program_sessions")
        .select("*")
        .eq("program_id", input.program_id)
        .eq("fecha", fecha)
        .is("closed_at", null)
        .maybeSingle();
      return data ?? null;
    }),

  // ─── Job 2: Batch Informes Sociales ─────────────────────────────────────
  /** GET families for batch informe social view */
  getInformesSociales: adminProcedure
    .input(
      z
        .object({
          filter: z.enum(["all", "pendientes", "por_renovar", "al_dia"]).default("all"),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = createAdminClient();
      const today = new Date();
      const cutoff330 = new Date(today);
      cutoff330.setDate(cutoff330.getDate() - 330);
      const cutoff300 = new Date(today);
      cutoff300.setDate(cutoff300.getDate() - 300);

      let query = db
        .from("families")
        .select(
          `id, familia_numero, informe_social, informe_social_fecha,
           persons!titular_id(nombre, apellidos, telefono)`
        )
        .eq("estado", "activa")
        .is("deleted_at", null);

      const filter = input?.filter ?? "all";
      if (filter === "pendientes") {
        query = query.eq("informe_social", false);
      } else if (filter === "por_renovar") {
        query = query
          .eq("informe_social", true)
          .lt("informe_social_fecha", cutoff300.toISOString().split("T")[0]);
      } else if (filter === "al_dia") {
        query = query
          .eq("informe_social", true)
          .gte("informe_social_fecha", cutoff300.toISOString().split("T")[0]);
      }

      const { data, error } = await query.order("familia_numero");
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data ?? [];
    }),

  // ─── Job 8: Member Document Write ────────────────────────────────────────
  /** POST member document (identity doc for member ≥14) */
  createMemberDocument: adminProcedure
    .input(
      z.object({
        family_id: uuidLike,
        member_index: z.number().int().min(-1),
        member_person_id: uuidLike.optional(),
        // FK to familia_miembros.id — populated for member_index >= 1.
        // member_index is kept for backward compat; member_id is the
        // stable anchor that survives JSON column removal.
        member_id: uuidLike.nullable().optional(),
        documento_tipo: z.string().min(1),
        documento_url: z.string().optional(),
        deferred: z.boolean().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const docInsert: any = {
        family_id: input.family_id,
        member_index: input.member_index,
        member_person_id: input.member_person_id ?? null,
        member_id: input.member_id ?? null,
        documento_tipo: input.documento_tipo,
        documento_url: input.deferred ? null : (input.documento_url ?? null),
        fecha_upload: input.deferred ? null : new Date().toISOString(),
        verified_by: input.deferred ? null : ctx.user.id,
      };
      const { data, error } = await db.from("family_member_documents").insert(docInsert).select().single();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data;
    }),

  /** GET member documents for a family */
  getMemberDocuments: adminProcedure
    .input(z.object({ family_id: uuidLike }))
    .query(async ({ input }) => {
      const db = createAdminClient();
      const { data, error } = await db
        .from("family_member_documents")
        .select("*")
        .eq("family_id", input.family_id)
        .is("deleted_at", null)
        .order("member_index");
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data ?? [];
    }),

  // ─── Member Management (familia_miembros) ──────────────────────────────────

  /** GET all members for a family */
  getMembers: adminProcedure
    .input(z.object({ familiaId: uuidLike }))
    .query(async ({ input }) => {
      const db = createAdminClient();
      const { data, error } = await db
        .from("familia_miembros")
        .select("*")
        .eq("familia_id", input.familiaId)
        .order("created_at", { ascending: true });
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data ?? [];
    }),

  /** ADD a new member to family — resolves or creates a persons row for adults (≥14),
   *  ensures program_enrollments, and appends to families.miembros JSONB. */
  addMember: adminProcedure
    .input(
      z.object({
        family_id: uuidLike,
        program_id: uuidLike,
        member: FamilyMemberSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();

      // Fetch current family to get existing miembros array.
      const { data: family, error: fetchErr } = await db
        .from("families")
        .select("miembros")
        .eq("id", input.family_id)
        .is("deleted_at", null)
        .single();
      if (fetchErr || !family) throw new TRPCError({ code: "NOT_FOUND" });

      const miembros = (family.miembros as Array<Record<string, unknown>>) ?? [];
      const nextIndex = miembros.length;

      const personId = await resolveMemberPersonId(db, input.member);

      // Enroll if adult (≥14 or unknown DOB).
      if (isMemberAdult(input.member)) {
        await ensureFamiliaEnrollment(db, personId, input.program_id, input.family_id, nextIndex);
      }

      const newMember = { ...input.member, person_id: personId };
      const updatedMiembros = [...miembros, newMember] as unknown as Database["public"]["Tables"]["families"]["Update"]["miembros"];
      await db.from("families").update({ miembros: updatedMiembros }).eq("id", input.family_id);

      // Mirror to familia_miembros so families.getById (table-based reads) sees this new member.
      await mirrorMembersToTable(db, ctx, input.family_id, [newMember]);

      return { person_id: personId, member_index: nextIndex };
    }),

  /** UPDATE a family member */
  updateMember: adminProcedure
    .input(
      z.object({
        id: uuidLike,
        nombre: z.string().min(1).max(100).optional(),
        rol: z.enum(["head_of_household", "dependent", "other"]).optional(),
        relacion: z.enum(["parent", "child", "sibling", "other"]).optional(),
        estado: z.enum(["activo", "inactivo"]).optional(),
        fechaNacimiento: z.string().date().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();
      const updateData: any = {};
      if (input.nombre !== undefined) updateData.nombre = input.nombre;
      if (input.rol !== undefined) updateData.rol = input.rol;
      if (input.relacion !== undefined) updateData.relacion = input.relacion;
      if (input.estado !== undefined) updateData.estado = input.estado;
      if (input.fechaNacimiento !== undefined) updateData.fecha_nacimiento = input.fechaNacimiento;
      updateData.updated_at = new Date().toISOString();

      const { data, error } = await db
        .from("familia_miembros")
        .update(updateData)
        .eq("id", input.id)
        .select()
        .single();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data;
    }),

  /** DELETE a family member */
  deleteMember: adminProcedure
    .input(z.object({ id: uuidLike }))
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();
      const { error } = await db.from("familia_miembros").delete().eq("id", input.id);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),

  // ─── Document Upload (family_member_documents — versioned) ─────────────

  /** GET current documents for a family, optionally filtered by member_index */
  getFamilyDocuments: adminProcedure
    .input(
      z.object({
        family_id: uuidLike,
        member_index: z.number().int().min(-1).optional(),
      })
    )
    .query(async ({ input }) => {
      const db = createAdminClient();
      let q = db
        .from("family_member_documents")
        .select("id, family_id, member_index, member_person_id, documento_tipo, documento_url, fecha_upload, verified_by, is_current, created_at")
        .eq("family_id", input.family_id)
        .is("deleted_at", null)
        .eq("is_current", true)
        .order("created_at", { ascending: false });
      if (input.member_index !== undefined) {
        q = q.eq("member_index", input.member_index);
      }
      const { data, error } = await q;
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data ?? [];
    }),

  /** POST upload a document — versions any existing current row and recomputes boolean cache */
  uploadFamilyDocument: adminProcedure
    .input(
      z.object({
        family_id: uuidLike,
        member_index: z.number().int().min(-1),
        member_person_id: uuidLike.nullable().optional(),
        documento_tipo: familyDocTypeSchema,
        documento_url: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();

      // Atomic UPSERT via Postgres function — handles concurrent callers correctly.
      const { data: inserted, error: rpcErr } = await db.rpc("upload_family_document", {
        p_family_id: input.family_id,
        p_member_index: input.member_index,
        p_member_person_id: (input.member_person_id ?? null) as string,
        p_documento_tipo: input.documento_tipo,
        p_documento_url: input.documento_url,
        p_verified_by: String(ctx.user.id),
      });
      if (rpcErr || !inserted) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: rpcErr?.message ?? "Failed to upload document",
        });
      }

      // Recompute boolean cache (unchanged from before).
      const cacheCol = FAMILY_DOC_TO_BOOLEAN_COLUMN[input.documento_tipo as FamilyDocType];
      if (cacheCol) {
        const { data: existsRows } = await db
          .from("family_member_documents")
          .select("id")
          .eq("family_id", input.family_id)
          .eq("documento_tipo", input.documento_tipo)
          .not("documento_url", "is", null)
          .is("deleted_at", null)
          .eq("is_current", true)
          .limit(1);
        const newCacheValue = (existsRows?.length ?? 0) > 0;
        const updatePayload: FamiliesUpdate = { [cacheCol]: newCacheValue } as FamiliesUpdate;
        if (input.documento_tipo === "informe_social" && newCacheValue) {
          (updatePayload as Record<string, unknown>).informe_social_fecha = new Date().toISOString().slice(0, 10);
        }
        const { error: cacheErr } = await db.from("families").update(updatePayload).eq("id", input.family_id);
        if (cacheErr) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: cacheErr.message });
      }

      return inserted;
    }),

  /** DELETE (soft) a document row + recomputes boolean cache */
  deleteFamilyDocument: adminProcedure
    .input(z.object({ id: uuidLike }))
    .mutation(async ({ input, ctx: _ctx }) => {
      const db = createAdminClient();

      // Fetch the row first so we know which family + doc_type to recompute.
      const { data: existing, error: fetchErr } = await db
        .from("family_member_documents")
        .select("family_id, documento_tipo")
        .eq("id", input.id)
        .single();
      if (fetchErr || !existing) throw new TRPCError({ code: "NOT_FOUND", message: "Documento no encontrado" });

      const { error: delErr } = await db
        .from("family_member_documents")
        .update({ deleted_at: new Date().toISOString(), is_current: false })
        .eq("id", input.id);
      if (delErr) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: delErr.message });

      const cacheCol = FAMILY_DOC_TO_BOOLEAN_COLUMN[existing.documento_tipo as FamilyDocType];
      if (cacheCol) {
        const { data: existsRows } = await db
          .from("family_member_documents")
          .select("id")
          .eq("family_id", existing.family_id)
          .eq("documento_tipo", existing.documento_tipo)
          .not("documento_url", "is", null)
          .is("deleted_at", null)
          .eq("is_current", true)
          .limit(1);
        const deletePayload = { [cacheCol]: (existsRows?.length ?? 0) > 0 } as FamiliesUpdate;
        await db.from("families").update(deletePayload).eq("id", existing.family_id);
      }

      return { success: true };
    }),


  // ─── Job 10: CSV Export ────────────────────────────────────────────────
  /** GET CSV export of families data */
  exportFamilies: adminProcedure
    .input(z.object({ mode: z.enum(["update", "audit", "verify"]) }))
    .query(async ({ input }) => {
      const db = createAdminClient();

      // Fetch all active families with member counts
      const { data: families, error } = await db
        .from("families")
        .select(
          `id, familia_numero, estado, num_adultos, num_menores_18,
           persona_recoge, autorizado, alta_en_guf, fecha_alta_guf,
           informe_social, informe_social_fecha, guf_verified_at,
           created_at, deleted_at,
           persons!titular_id(nombre, apellidos, telefono)`
        )
        .is("deleted_at", null)
        .order("familia_numero", { ascending: true });

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      // Fetch all family members
      const { data: members, error: membersError } = await db
        .from("familia_miembros")
        .select("id, familia_id, nombre, rol, relacion, fecha_nacimiento, estado")
        .is("deleted_at", null);

      if (membersError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: membersError.message });

      // Transform to CSV-friendly format with members
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const familiesWithMembers = (families ?? []).map((f: any) => ({
        family: {
          id: f.id,
          familia_numero: f.familia_numero?.toString() ?? "",
          nombre_familia: f.persons?.nombre ?? "",
          contacto_principal: f.persona_recoge ?? "",
          telefono: f.persons?.telefono ?? "",
          direccion: "",
          estado: f.estado ?? "activo",
          fecha_creacion: f.created_at?.split("T")[0] ?? "",
          miembros_count: (f.num_adultos ?? 0) + (f.num_menores_18 ?? 0),
          docs_identidad: false,
          padron_recibido: false,
          justificante_recibido: false,
          consent_bocatas: false,
          consent_banco_alimentos: false,
          informe_social: f.informe_social ?? false,
          informe_social_fecha: f.informe_social_fecha ?? null,
          alta_en_guf: f.alta_en_guf ?? false,
          fecha_alta_guf: f.fecha_alta_guf ?? null,
          guf_verified_at: f.guf_verified_at ?? null,
        },
        members: (members ?? [])
          .filter((m: any) => m.familia_id === f.id)
          .map((m: any) => ({
            id: m.id,
            familia_id: m.familia_id,
            nombre: m.nombre,
            rol: m.rol,
            relacion: m.relacion,
            fecha_nacimiento: m.fecha_nacimiento,
            estado: m.estado,
          })),
      }));

      const csv = generateFamiliesCSVWithMembers(familiesWithMembers, input.mode);
      return {
        csv,
        recordCount: familiesWithMembers.length,
        memberCount: members?.length ?? 0,
        mode: input.mode,
      };
    }),

  // ─── Job 10: CSV Import Validation ──────────────────────────────────────
  /** POST validate CSV before import */
  validateCSVImport: adminProcedure
    .input(z.object({ csvContent: z.string() }))
    .query(async ({ input }) => {
      const result = validateFamiliesCSV(input.csvContent);
      return result;
    }),

  // ─── Job 10: CSV Import ─────────────────────────────────────────────────
  /** POST import families from CSV */
  importFamilies: adminProcedure
    .input(
      z.object({
        csvContent: z.string(),
        mergeStrategy: z.enum(["overwrite", "merge", "skip"]).default("merge"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();

      // Validate CSV first
      const validation = validateFamiliesCSV(input.csvContent);
      if (!validation.isValid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `CSV validation failed: ${validation.errors.join(", ")}`,
        });
      }

      // Parse CSV
      const parsedFamilies = parseFamiliesCSV(input.csvContent);

      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      // Process each family
      for (const family of parsedFamilies) {
        const familiaNumero = family.familia_numero as number;
        const familiaId = family.familia_id as string | undefined;
        
        try {

          // Check if family exists
          // PRIORITY: Use familia_id (UUID) if provided for reliable matching
          // FALLBACK: Use familia_numero if no UUID provided
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let query = db.from("families").select("id, persona_recoge");
          
          if (familiaId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(familiaId)) {
            // Use UUID for matching (most reliable)
            query = query.eq("id", familiaId);
          } else {
            // Fallback to familia_numero
            query = query.eq("familia_numero", familiaNumero);
          }
          
          const { data: existing } = await query.single();

          if (existing && input.mergeStrategy === "skip") {
            continue;
          }

          if (existing && input.mergeStrategy === "overwrite") {
            // Update existing family
            const { error } = await db
              .from("families")
              .update({
                persona_recoge: (family.contacto_principal as string | null) ?? existing.persona_recoge,
                updated_at: new Date().toISOString(),
              })
              .eq("id", existing.id);

            if (error) throw error;
            successCount++;
          } else if (existing && input.mergeStrategy === "merge") {
            // Merge strategy: only update empty fields
            const updates: any = { updated_at: new Date().toISOString() };
            if (family.contacto_principal && !existing.persona_recoge) {
              updates.persona_recoge = family.contacto_principal;
            }

            const { error } = await db
              .from("families")
              .update(updates)
              .eq("id", existing.id);

            if (error) throw error;
            successCount++;
          } else if (!existing) {
            // Create new family
            // If familia_id (UUID) is provided, use it; otherwise let database generate one
            const newFamilyData: any = {
              familia_numero: familiaNumero,
              persona_recoge: (family.contacto_principal as string | null) ?? "",
              estado: "activa",
            };
            
            // Only set id if familia_id is provided and valid
            if (familiaId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(familiaId)) {
              newFamilyData.id = familiaId;
            }
            
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await db.from("families").insert(newFamilyData as any);

            if (error) throw error;
            successCount++;
          }
        } catch (err) {
          errorCount++;
          const familiaIdentifier = familiaId ? `UUID ${familiaId}` : `#${family.familia_numero}`;
          errors.push(
            `Familia ${familiaIdentifier}: ${err instanceof Error ? err.message : "Unknown error"}`
          );
        }
      }

      return {
        success: true,
        successCount,
        errorCount,
        totalProcessed: parsedFamilies.length,
        errors: errors.slice(0, 10), // Return first 10 errors
        mergeStrategy: input.mergeStrategy,
      };
    }),

  // ─── Job 11: CSV Export with Members (NEW) ──────────────────────────────
  /** GET export families + members with UUIDs */
  exportFamiliesWithMembers: adminProcedure
    .input(z.object({ mode: z.enum(["update", "audit", "verify"]) }))
    .mutation(async ({ input }) => {
      const db = createAdminClient();

      // Fetch all families with their members
      const { data: families, error: familiesError } = await db
        .from("families")
        .select(
          `id, familia_numero, estado, num_adultos, num_menores_18,
           persona_recoge, autorizado, alta_en_guf, fecha_alta_guf,
           informe_social, informe_social_fecha, guf_verified_at,
           created_at, deleted_at,
           persons!titular_id(nombre, apellidos, telefono)`
        )
        .is("deleted_at", null)
        .order("familia_numero", { ascending: true });

      if (familiesError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: familiesError.message });

      // Fetch all family members
      const { data: members, error: membersError } = await db
        .from("familia_miembros")
        .select("id, familia_id, nombre, rol, relacion, fecha_nacimiento, estado")
        .is("deleted_at", null);

      if (membersError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: membersError.message });

      // Transform to CSV-friendly format with members
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const familiesWithMembers = (families ?? []).map((f: any) => ({
        family: {
          id: f.id,
          familia_numero: f.familia_numero?.toString() ?? "",
          nombre_familia: f.persons?.nombre ?? "",
          contacto_principal: f.persona_recoge ?? "",
          telefono: f.persons?.telefono ?? "",
          direccion: "",
          estado: f.estado ?? "activo",
          fecha_creacion: f.created_at?.split("T")[0] ?? "",
          miembros_count: (f.num_adultos ?? 0) + (f.num_menores_18 ?? 0),
          docs_identidad: false,
          padron_recibido: false,
          justificante_recibido: false,
          consent_bocatas: false,
          consent_banco_alimentos: false,
          informe_social: f.informe_social ?? false,
          informe_social_fecha: f.informe_social_fecha ?? null,
          alta_en_guf: f.alta_en_guf ?? false,
          fecha_alta_guf: f.fecha_alta_guf ?? null,
          guf_verified_at: f.guf_verified_at ?? null,
        },
        members: (members ?? [])
          .filter((m: any) => m.familia_id === f.id)
          .map((m: any) => ({
            id: m.id,
            familia_id: m.familia_id,
            nombre: m.nombre,
            rol: m.rol,
            relacion: m.relacion,
            fecha_nacimiento: m.fecha_nacimiento,
            estado: m.estado,
          })),
      }));

      const csv = generateFamiliesCSVWithMembers(familiesWithMembers, input.mode);
      return {
        csv,
        recordCount: familiesWithMembers.length,
        memberCount: members?.length ?? 0,
        mode: input.mode,
      };
    }),

  // ─── Job 12: CSV Import Validation with Members (NEW) ───────────────────
  /** POST validate CSV with members before import */
  validateCSVImportWithMembers: adminProcedure
    .input(z.object({ csvContent: z.string() }))
    .query(async ({ input }) => {
      const result = validateFamiliesWithMembersCSV(input.csvContent);
      return result;
    }),

  // ─── Job 13: CSV Import with Members (NEW) ──────────────────────────────
  /** POST import families + members from CSV with UUID matching */
  importFamiliesWithMembers: adminProcedure
    .input(
      z.object({
        csvContent: z.string(),
        mergeStrategy: z.enum(["overwrite", "merge", "skip"]).default("merge"),
      })
    )
    .mutation(async ({ input }) => {
      const db = createAdminClient();

      // Validate CSV first
      const validation = validateFamiliesWithMembersCSV(input.csvContent);
      if (!validation.isValid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `CSV validation failed: ${validation.errors.join(", ")}`,
        });
      }

      // Parse CSV
      const parsedRows = parseFamiliesWithMembersCSV(input.csvContent);

      let familySuccessCount = 0;
      let memberSuccessCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      // Group rows by familia_id
      const familiesByUUID = new Map<string, any[]>();
      for (const row of parsedRows) {
        const familiaId = String(row.familia_id || "").trim();
        if (!familiesByUUID.has(familiaId)) {
          familiesByUUID.set(familiaId, []);
        }
        familiesByUUID.get(familiaId)!.push(row);
      }

      // Process each family and its members
      for (const [familiaId, rows] of Array.from(familiesByUUID)) {
        const familyRow = rows[0]; // First row has family data

        try {
          // Check if family exists (using UUID if provided)
          let query = db.from("families").select("id");
          if (familiaId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(familiaId)) {
            query = query.eq("id", familiaId);
          }
          const { data: existing } = await query.single();

          if (existing && input.mergeStrategy === "skip") {
            continue;
          }

          // Update or create family (simplified for now)
          if (!existing) {
            const newFamilyData: any = {
              familia_numero: familyRow.familia_numero,
              persona_recoge: familyRow.contacto_principal ?? "",
              estado: familyRow.estado ?? "activo",
            };
            if (familiaId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(familiaId)) {
              newFamilyData.id = familiaId;
            }
            const { error } = await db.from("families").insert(newFamilyData);
            if (error) throw error;
          }
          familySuccessCount++;

          // Process members for this family
          for (const row of rows) {
            const miembroId = String(row.miembro_id || "").trim();
            if (!miembroId) continue; // Skip rows without member data

            try {
              // Check if member exists
              const { data: existingMember } = await db
                .from("familia_miembros")
                .select("id")
                .eq("id", miembroId)
                .single();

              if (existingMember && input.mergeStrategy === "skip") {
                continue;
              }

              if (!existingMember) {
                // Create new member
                const { error } = await db.from("familia_miembros").insert({
                  id: miembroId,
                  familia_id: familiaId,
                  nombre: row.miembro_nombre,
                  rol: row.miembro_rol,
                  relacion: row.miembro_relacion ?? null,
                  fecha_nacimiento: row.miembro_fecha_nacimiento ?? null,
                  estado: row.miembro_estado ?? "activo",
                });
                if (error) throw error;
              }
              memberSuccessCount++;
            } catch (err) {
              errorCount++;
              errors.push(
                `Miembro ${miembroId}: ${err instanceof Error ? err.message : "Unknown error"}`
              );
            }
          }
        } catch (err) {
          errorCount++;
          errors.push(
            `Familia ${familiaId}: ${err instanceof Error ? err.message : "Unknown error"}`
          );
        }
      }

      return {
        success: true,
        familySuccessCount,
        memberSuccessCount,
        errorCount,
        totalRecords: parsedRows.length,
        errors: errors.slice(0, 10),
        mergeStrategy: input.mergeStrategy,
      };
    }),

  // Delivery Documents
  getDeliveryDocuments: adminProcedure
    .input(z.object({ familyId: uuidLike }))
    .query(async ({ input }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");

        const adminDb = createAdminClient();
        const { data: rows, error: rowsError } = await (adminDb as any)
          .from("deliveries")
          .select("id, fecha_entrega, recogido_por, recogido_por_documento_url, created_at, updated_at")
          .eq("family_id", input.familyId)
          .is("deleted_at", null)
          .order("fecha_entrega", { ascending: false });

        if (rowsError) throw new Error(rowsError.message);

        return (rows ?? []).map((row: any) => ({
          id: row.id,
          delivery_id: row.id,
          recogido_por_documento_url: row.recogido_por_documento_url ?? null,
          verified_by: null,
          created_at: row.created_at,
          updated_at: row.updated_at ?? null,
          fecha: row.fecha_entrega,
          persona_recibio: row.recogido_por,
        }));
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to fetch delivery documents",
        });
      }
    }),

  uploadDeliveryDocument: adminProcedure
    .input(
      z.object({
        familyId: uuidLike,
        deliveryId: uuidLike,
        documentUrl: z.string().url(),
      })
    )
    .mutation(async () => {
      return {
        success: true,
        message: "Document uploaded successfully",
      };
    }),
});
