import { describe, it, expect, beforeAll } from "vitest";
import { createAdminClient } from "../../client/src/lib/supabase/server";

describe("Bulk Import History", () => {
  let supabase: ReturnType<typeof createAdminClient>;
  const testOpenId = "test-user-openid-12345";

  beforeAll(() => {
    supabase = createAdminClient();
  });

  /**
   * TEST 1: Create import history record
   */
  it("should create import history record", async () => {
    const { data, error } = await supabase
      .from("bulk_import_history")
      .insert({
        created_by: testOpenId,
        status: "pending",
        total_rows: 10,
        successful_rows: 0,
        failed_rows: 0,
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data?.created_by).toBe(testOpenId);
    expect(data?.status).toBe("pending");
    expect(data?.total_rows).toBe(10);
  });

  /**
   * TEST 2: Update import history to completed
   */
  it("should update import history to completed status", async () => {
    // First create a record
    const { data: created } = await supabase
      .from("bulk_import_history")
      .insert({
        created_by: testOpenId,
        status: "pending",
        total_rows: 5,
        successful_rows: 0,
        failed_rows: 0,
      })
      .select()
      .single();

    // Then update it
    const { data, error } = await supabase
      .from("bulk_import_history")
      .update({
        status: "completed",
        successful_rows: 5,
        failed_rows: 0,
        completed_at: new Date().toISOString(),
      })
      .eq("id", created?.id)
      .select()
      .single();

    expect(error).toBeNull();
    expect(data?.status).toBe("completed");
    expect(data?.successful_rows).toBe(5);
  });

  /**
   * TEST 3: Record import failure with error message
   */
  it("should record import failure with error message", async () => {
    const { data, error } = await supabase
      .from("bulk_import_history")
      .insert({
        created_by: testOpenId,
        status: "failed",
        total_rows: 3,
        successful_rows: 1,
        failed_rows: 2,
        error_message: "Invalid date format in row 2",
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data?.status).toBe("failed");
    expect(data?.error_message).toContain("Invalid date format");
  });

  /**
   * TEST 4: Query user's import history
   */
  it("should retrieve user's import history", async () => {
    // Create a test record
    await supabase.from("bulk_import_history").insert({
      created_by: testOpenId,
      status: "completed",
      total_rows: 2,
      successful_rows: 2,
      failed_rows: 0,
    });

    // Query it back
    const { data, error } = await supabase
      .from("bulk_import_history")
      .select()
      .eq("created_by", testOpenId)
      .order("created_at", { ascending: false });

    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThan(0);
    expect(data?.[0]?.created_by).toBe(testOpenId);
  });
});
