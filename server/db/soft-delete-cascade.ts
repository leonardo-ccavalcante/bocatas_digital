import type { SupabaseClient } from "@supabase/supabase-js";

export interface CascadeRule {
  parentTable: string;
  childTable: string;
  foreignKeyColumn: string;
  parentIdColumn: string;
}

const CASCADE_RULES: CascadeRule[] = [
  {
    parentTable: "families",
    childTable: "familia_miembros",
    foreignKeyColumn: "familia_id",
    parentIdColumn: "id",
  },
  {
    parentTable: "families",
    childTable: "entregas",
    foreignKeyColumn: "familia_id",
    parentIdColumn: "id",
  },
  {
    parentTable: "persons",
    childTable: "programa_participante",
    foreignKeyColumn: "persona_id",
    parentIdColumn: "id",
  },
  {
    parentTable: "programs",
    childTable: "programa_participante",
    foreignKeyColumn: "programa_id",
    parentIdColumn: "id",
  },
];

export async function softDeleteWithCascade(
  db: SupabaseClient,
  tableName: string,
  recordId: string
): Promise<void> {
  const now = new Date().toISOString();

  // Soft delete the parent record
  const { error: parentError } = await db
    .from(tableName)
    .update({ deleted_at: now })
    .eq("id", recordId);

  if (parentError) {
    throw new Error(
      `Failed to soft-delete ${tableName} ${recordId}: ${parentError.message}`
    );
  }

  // Find and cascade to child records
  const applicableRules = CASCADE_RULES.filter((r) => r.parentTable === tableName);

  for (const rule of applicableRules) {
    // Get all child records
    const { data: childRecords, error: selectError } = await db
      .from(rule.childTable)
      .select("id")
      .eq(rule.foreignKeyColumn, recordId)
      .is("deleted_at", null); // Only cascade to non-deleted records

    if (selectError) {
      console.error(
        `Failed to fetch ${rule.childTable} records for cascade:`,
        selectError
      );
      continue;
    }

    if (childRecords && childRecords.length > 0) {
      // Soft delete all child records
      const { error: updateError } = await db
        .from(rule.childTable)
        .update({ deleted_at: now })
        .eq(rule.foreignKeyColumn, recordId)
        .is("deleted_at", null);

      if (updateError) {
        console.error(
          `Failed to cascade soft-delete to ${rule.childTable}:`,
          updateError
        );
      }
    }
  }
}

export async function restoreWithCascade(
  db: SupabaseClient,
  tableName: string,
  recordId: string
): Promise<void> {
  // Restore the parent record
  const { error: parentError } = await db
    .from(tableName)
    .update({ deleted_at: null })
    .eq("id", recordId);

  if (parentError) {
    throw new Error(
      `Failed to restore ${tableName} ${recordId}: ${parentError.message}`
    );
  }

  // Restore child records that were deleted at the same time
  const { data: parentRecord, error: selectError } = await db
    .from(tableName)
    .select("deleted_at")
    .eq("id", recordId)
    .single();

  if (selectError || !parentRecord) {
    console.error("Failed to fetch parent record for cascade restore");
    return;
  }

  const applicableRules = CASCADE_RULES.filter((r) => r.parentTable === tableName);

  for (const rule of applicableRules) {
    // Restore child records (optional: only those deleted around same time)
    const { error: updateError } = await db
      .from(rule.childTable)
      .update({ deleted_at: null })
      .eq(rule.foreignKeyColumn, recordId)
      .not("deleted_at", "is", null);

    if (updateError) {
      console.error(
        `Failed to cascade restore to ${rule.childTable}:`,
        updateError
      );
    }
  }
}

export function getCascadeRules(tableName: string): CascadeRule[] {
  return CASCADE_RULES.filter((r) => r.parentTable === tableName);
}
