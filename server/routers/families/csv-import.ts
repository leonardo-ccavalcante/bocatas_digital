import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { validateFamiliesCSV, parseFamiliesCSV } from "../../csvImport";
import {
  validateFamiliesWithMembersCSV,
  parseFamiliesWithMembersCSV,
} from "../../csvImportWithMembers";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// DB CHECK-allowed enum values (verified live in prod). Held here at the write
// site so a GUF CSV carrying free-text / Spanish / capitalized enum cells cannot
// abort the import with a raw 23514 CHECK violation — which the per-row catch
// turned into a silently dropped family/member. (MYTHOS TES-08)
const FAMILY_ESTADO = ["activa", "baja"] as const; // families.estado CHECK
const MEMBER_ROL = ["head_of_household", "dependent", "other"] as const; // familia_miembros.rol CHECK (NOT NULL)
const MEMBER_RELACION = [
  "parent", "child", "sibling", "other",
  "esposo_a", "hijo_a", "madre", "padre", "suegro_a", "hermano_a", "abuelo_a", "otro",
] as const; // familia_miembros.relacion CHECK
const MEMBER_ESTADO = ["activo", "inactivo"] as const; // familia_miembros.estado CHECK

/**
 * Coerce a raw CSV cell to a DB CHECK-valid enum value (case-insensitive, trimmed).
 * Falls back to a valid default when the cell is absent or unrecognized, so the row
 * imports as a known-good value instead of failing the CHECK and being dropped.
 */
function coerceEnum<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
  const v = String(raw ?? "").trim().toLowerCase();
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

export const csvImportRouter = router({
  // ─── Job 10: CSV Import Validation ──────────────────────────────────────
  /** POST validate CSV before import */
  validateCSVImport: adminProcedure
    .input(z.object({ csvContent: z.string() }))
    .query(async ({ input }) => {
      return validateFamiliesCSV(input.csvContent);
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
    .mutation(async ({ input }) => {
      const db = createAdminClient();

      const validation = validateFamiliesCSV(input.csvContent);
      if (!validation.isValid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `CSV validation failed: ${validation.errors.join(", ")}`,
        });
      }

      const parsedFamilies = parseFamiliesCSV(input.csvContent);

      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (const family of parsedFamilies) {
        const familiaNumero = family.familia_numero as number;
        const familiaId = family.familia_id as string | undefined;

        try {
          let query = db.from("families").select("id, persona_recoge");

          if (familiaId && UUID_RE.test(familiaId)) {
            query = query.eq("id", familiaId);
          } else {
            query = query.eq("familia_numero", familiaNumero);
          }

          const { data: existing } = await query.single();

          if (existing && input.mergeStrategy === "skip") {
            continue;
          }

          if (existing && input.mergeStrategy === "overwrite") {
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const newFamilyData: any = {
              familia_numero: familiaNumero,
              persona_recoge: (family.contacto_principal as string | null) ?? "",
              estado: "activa",
            };

            if (familiaId && UUID_RE.test(familiaId)) {
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
        errors: errors.slice(0, 10),
        mergeStrategy: input.mergeStrategy,
      };
    }),

  // ─── Job 12: CSV Import Validation with Members (NEW) ───────────────────
  /** POST validate CSV with members before import */
  validateCSVImportWithMembers: adminProcedure
    .input(z.object({ csvContent: z.string() }))
    .query(async ({ input }) => {
      return validateFamiliesWithMembersCSV(input.csvContent);
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

      const validation = validateFamiliesWithMembersCSV(input.csvContent);
      if (!validation.isValid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `CSV validation failed: ${validation.errors.join(", ")}`,
        });
      }

      const parsedRows = parseFamiliesWithMembersCSV(input.csvContent);

      let familySuccessCount = 0;
      let memberSuccessCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const familiesByUUID = new Map<string, any[]>();
      for (const row of parsedRows) {
        const familiaId = String(row.familia_id || "").trim();
        if (!familiesByUUID.has(familiaId)) {
          familiesByUUID.set(familiaId, []);
        }
        familiesByUUID.get(familiaId)!.push(row);
      }

      for (const [familiaId, rows] of Array.from(familiesByUUID)) {
        const familyRow = rows[0];

        try {
          let query = db.from("families").select("id");
          if (familiaId && UUID_RE.test(familiaId)) {
            query = query.eq("id", familiaId);
          }
          const { data: existing } = await query.single();

          if (existing && input.mergeStrategy === "skip") {
            continue;
          }

          if (!existing) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const newFamilyData: any = {
              familia_numero: familyRow.familia_numero,
              persona_recoge: familyRow.contacto_principal ?? "",
              // families.estado CHECK is ('activa','baja') — the previous "activo"
              // default was itself an invalid value (member spelling). (TES-08)
              estado: coerceEnum(familyRow.estado, FAMILY_ESTADO, "activa"),
            };
            if (familiaId && UUID_RE.test(familiaId)) {
              newFamilyData.id = familiaId;
            }
            const { error } = await db.from("families").insert(newFamilyData);
            if (error) throw error;
          }
          familySuccessCount++;

          for (const row of rows) {
            const miembroId = String(row.miembro_id || "").trim();
            if (!miembroId) continue;

            try {
              const { data: existingMember } = await db
                .from("familia_miembros")
                .select("id")
                .eq("id", miembroId)
                .single();

              if (existingMember && input.mergeStrategy === "skip") {
                continue;
              }

              if (!existingMember) {
                const { error } = await db.from("familia_miembros").insert({
                  id: miembroId,
                  familia_id: familiaId,
                  nombre: row.miembro_nombre,
                  // rol is NOT NULL + CHECK; relacion/estado are CHECK-constrained.
                  // Coerce raw CSV cells to DB-valid values so a bad GUF value imports
                  // (rol→other, relacion→otro, estado→activo) instead of 23514. (TES-08)
                  rol: coerceEnum(row.miembro_rol, MEMBER_ROL, "other"),
                  relacion: row.miembro_relacion
                    ? coerceEnum(row.miembro_relacion, MEMBER_RELACION, "otro")
                    : null,
                  fecha_nacimiento: row.miembro_fecha_nacimiento ?? null,
                  estado: coerceEnum(row.miembro_estado, MEMBER_ESTADO, "activo"),
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
});
