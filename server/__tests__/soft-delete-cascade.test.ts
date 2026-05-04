import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { softDeleteWithCascade } from "../db/soft-delete-cascade";

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

describe("Soft-Delete Cascade Rules", () => {
  let testFamilyId: string;
  let testMemberId: string;
  let db: ReturnType<typeof createClient>;

  beforeAll(async () => {
    db = createClient(supabaseUrl, supabaseServiceKey);

    // Create test family
    const { data: familyData, error: familyError } = await db
      .from("families")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({ familia_numero: 99999, estado: "activa" } as any)
      .select()
      .single();

    if (familyError || !familyData) {
      throw new Error(`Failed to create test family: ${familyError?.message}`);
    }

    testFamilyId = (familyData as { id: string }).id;

    // Create test member
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: memberData, error: memberError } = await (db as any)
      .from("familia_miembros")
      .insert({
        familia_id: testFamilyId,
        nombre: "Test Member",
        rol: "titular",
      })
      .select()
      .single();

    if (memberError || !memberData) {
      throw new Error(`Failed to create test member: ${memberError?.message}`);
    }

    testMemberId = (memberData as { id: string }).id;
  });

  afterAll(async () => {
    // Hard delete test data
    await db.from("familia_miembros").delete().eq("id", testMemberId);
    await db.from("families").delete().eq("id", testFamilyId);
  });

  it("soft-deletes family and cascades to members", async () => {
    // Soft delete family
    await softDeleteWithCascade(db, "families", testFamilyId);

    // Verify family is soft-deleted
    const { data: family } = await db
      .from("families")
      .select("deleted_at")
      .eq("id", testFamilyId)
      .single();

    expect((family as { deleted_at: string | null } | null)?.deleted_at).not.toBeNull();

    // Verify members are also soft-deleted
    const { data: members } = await db
      .from("familia_miembros")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("deleted_at" as any)
      .eq("familia_id", testFamilyId);

    expect(members).toHaveLength(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((members as any)?.[0]?.deleted_at).not.toBeNull();
  });

  it("preserves deletion timestamp for audit trail", async () => {
    const beforeDelete = new Date();
    await softDeleteWithCascade(db, "families", testFamilyId);
    const afterDelete = new Date();

    const { data: family } = await db
      .from("families")
      .select("deleted_at")
      .eq("id", testFamilyId)
      .single();

    const familyAny = family as { deleted_at: string | null } | null;
    const deletedAt = new Date(familyAny?.deleted_at ?? "");
    expect(deletedAt.getTime()).toBeGreaterThanOrEqual(beforeDelete.getTime());
    expect(deletedAt.getTime()).toBeLessThanOrEqual(afterDelete.getTime());
  });

  it("does not hard-delete records", async () => {
    // Soft delete
    await softDeleteWithCascade(db, "families", testFamilyId);

    // Record should still exist in database
    const { data: family, error } = await db
      .from("families")
      .select("id")
      .eq("id", testFamilyId)
      .single();

    expect(error).toBeNull();
    expect(family).toBeDefined();
  });
});
