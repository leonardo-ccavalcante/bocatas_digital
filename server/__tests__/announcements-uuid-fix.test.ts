import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createAdminClient } from "../../client/src/lib/supabase/server";

/**
 * TDD Tests for UUID Fix: bulk_import_previews.created_by
 *
 * REQUIREMENT: created_by column should accept openId (text) not uuid
 * This preserves audit trail and allows tracking who uploaded data
 *
 * RED Phase: Write failing tests first
 */

describe("Announcements - UUID Fix (created_by column)", () => {
  const db = createAdminClient();
  const testOpenId = "Vdx6QymMi2aW275wQBxTfU"; // Valid openId format (base64 string)
  const testToken = "550e8400-e29b-41d4-a716-446655440000"; // Valid UUID for token

  let previewId: string | null = null;

  afterAll(async () => {
    // Cleanup: delete test preview
    if (previewId) {
      await db.from("bulk_import_previews").delete().eq("token", testToken);
    }
  });

  /**
   * TEST 1: Preview saves with openId as text
   * Verifies that created_by column accepts openId string (not uuid)
   */
  it("should save preview with openId as text in created_by column", async () => {
    const testData = [
      {
        titulo: "Test Announcement",
        contenido: "Test content",
        tipo: "info",
        es_urgente: false,
        fecha_inicio: "2026-05-01",
        fecha_fin: "2026-05-31",
        fijado: false,
        audiencias: "all",
      },
    ];

    const { data, error } = await db
      .from("bulk_import_previews")
      .insert({
        token: testToken,
        parsed_rows: testData as unknown as never,
        created_by: testOpenId, // Should accept text openId, not uuid
      })
      .select("token, created_by")
      .single();

    // Should NOT error with "invalid input syntax for type uuid"
    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data?.created_by).toBe(testOpenId);
    expect(data?.token).toBe(testToken);

    previewId = data?.token || null;
  });

  /**
   * TEST 2: Confirmation retrieves preview by openId
   * Verifies ownership check works with openId
   */
  it("should retrieve preview using openId for ownership check", async () => {
    // First, insert a preview
    const { data: insertData } = await db
      .from("bulk_import_previews")
      .insert({
        token: testToken,
        parsed_rows: [] as unknown as never,
        created_by: testOpenId,
      })
      .select("token")
      .single();

    expect(insertData).toBeDefined();

    // Then, retrieve it using the same openId (ownership check)
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: retrievedData, error } = await db
      .from("bulk_import_previews")
      .select("token, created_by, created_at")
      .eq("token", testToken)
      .eq("created_by", testOpenId) // Ownership check with openId
      .gte("created_at", thirtyMinAgo)
      .maybeSingle();

    expect(error).toBeNull();
    expect(retrievedData).toBeDefined();
    expect(retrievedData?.created_by).toBe(testOpenId);
  });

  /**
   * TEST 3: Different openId cannot access another user's preview
   * Verifies ownership isolation
   */
  it("should not retrieve preview with different openId (ownership isolation)", async () => {
    const differentOpenId = "DifferentOpenIdXyz123456";

    // Insert preview with testOpenId
    await db
      .from("bulk_import_previews")
      .insert({
        token: testToken,
        parsed_rows: [] as unknown as never,
        created_by: testOpenId,
      })
      .select("token")
      .single();

    // Try to retrieve with different openId
    const { data: retrievedData } = await db
      .from("bulk_import_previews")
      .select("token, created_by")
      .eq("token", testToken)
      .eq("created_by", differentOpenId) // Different openId
      .maybeSingle();

    // Should not find the preview (ownership isolation)
    expect(retrievedData).toBeNull();
  });

  /**
   * TEST 4: Audit trail preserved - can identify uploader
   * Verifies that we store actual openId for tracking
   */
  it("should preserve audit trail - store actual openId for tracking", async () => {
    const uploadData = [
      {
        titulo: "Audit Test",
        contenido: "Testing audit trail",
        tipo: "info",
        es_urgente: false,
        fecha_inicio: "2026-05-01",
        fecha_fin: "2026-05-31",
        fijado: false,
        audiencias: "all",
      },
    ];

    const { data, error } = await db
      .from("bulk_import_previews")
      .insert({
        token: testToken,
        parsed_rows: uploadData as unknown as never,
        created_by: testOpenId,
      })
      .select("token, created_by, created_at")
      .single();

    expect(error).toBeNull();
    expect(data).toBeDefined();

    // Verify we can identify who uploaded
    expect(data?.created_by).toBe(testOpenId);
    expect(data?.created_at).toBeDefined();

    // In real scenario, we would join with users table to get user details
    // This proves the openId is stored and can be used for audit trail
  });

  /**
   * TEST 5: Multiple openIds can have their own previews
   * Verifies no cross-user contamination
   */
  it("should allow multiple users to have separate previews", async () => {
    const user1OpenId = "User1OpenId123456789";
    const user2OpenId = "User2OpenId987654321";
    const token1 = "11111111-1111-1111-1111-111111111111";
    const token2 = "22222222-2222-2222-2222-222222222222";

    // User 1 creates preview
    const { data: preview1 } = await db
      .from("bulk_import_previews")
      .insert({
        token: token1,
        parsed_rows: [] as unknown as never,
        created_by: user1OpenId,
      })
      .select("created_by")
      .single();

    // User 2 creates preview
    const { data: preview2 } = await db
      .from("bulk_import_previews")
      .insert({
        token: token2,
        parsed_rows: [] as unknown as never,
        created_by: user2OpenId,
      })
      .select("created_by")
      .single();

    expect(preview1?.created_by).toBe(user1OpenId);
    expect(preview2?.created_by).toBe(user2OpenId);

    // Cleanup
    await db.from("bulk_import_previews").delete().eq("token", token1);
    await db.from("bulk_import_previews").delete().eq("token", token2);
  });
});
