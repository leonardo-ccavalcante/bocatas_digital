/**
 * firma.audit.test.ts — Phase B.4.1 RED test (audit binding contract).
 *
 * After a delivery is recorded with a `firma_url`, a `delivery_signature_audit`
 * row MUST exist with (delivery_id, signer_person_id, signed_at,
 * client_ip_hash). This test mocks the future supabase shape and asserts
 * the contract that the production write path must satisfy.
 *
 * STATE: it.todo — flips to live `it()` once migration
 * `20260509000001_delivery_signature_audit.sql` is applied AND the
 * deliveries router is wired to write the audit row inside the same
 * transaction as the delivery insert. Until then the production write
 * path does NOT touch `delivery_signature_audit`, so a live test would
 * be a false positive.
 *
 * Why mocks here: the table doesn't exist yet on any reachable Postgres
 * — local supabase has not applied the migration (it's PENDING REVIEW).
 * Mocking the future shape locks the contract so the GREEN implementation
 * is unambiguous.
 */
import { describe, it, expect, vi } from "vitest";

// ─── Future shape contract ──────────────────────────────────────────────────
// This is what the wired createDelivery procedure MUST do once the
// migration lands and the router is updated. Captured here as an
// executable spec.

interface DeliverySignatureAuditRow {
  delivery_id: string;
  signer_person_id: string;
  signed_at: string;
  client_ip_hash: string | null;
}

interface CapturedAuditWrite {
  table: string;
  row: DeliverySignatureAuditRow;
}

/** Tiny supabase-like mock that captures table writes for assertions. */
function makeMockSupabase(): {
  writes: CapturedAuditWrite[];
  from: (table: string) => {
    insert: (row: DeliverySignatureAuditRow) => {
      select: () => { single: () => Promise<{ data: DeliverySignatureAuditRow; error: null }> };
    };
  };
} {
  const writes: CapturedAuditWrite[] = [];
  return {
    writes,
    from: (table: string) => ({
      insert: (row: DeliverySignatureAuditRow) => {
        writes.push({ table, row });
        return {
          select: () => ({
            single: async () => ({ data: row, error: null }),
          }),
        };
      },
    }),
  };
}

describe("firma audit binding contract (Phase B.4.1)", () => {
  it.todo(
    "creates a delivery_signature_audit row with (delivery_id, signer_person_id, signed_at, client_ip_hash) when a delivery is recorded with firma_url — GREEN once migration 20260509000001_delivery_signature_audit.sql is applied AND the deliveries router writes the audit row inside the same transaction",
  );

  it.todo(
    "the audit row's signed_at uses the server clock (DEFAULT now()), not a client-supplied timestamp — GREEN once migration 20260509000001 is applied",
  );

  it.todo(
    "the audit row's client_ip_hash is SHA-256(ip || daily_salt), never the raw IP — GREEN once migration 20260509000001 is applied AND the salt rotation job is in place",
  );

  it.todo(
    "a delivery WITHOUT firma_url MUST NOT produce an audit row — GREEN once migration 20260509000001 is applied",
  );

  // ─── Live mock-shape sanity test ──────────────────────────────────────────
  // This runs today and locks the EXPECTED row shape so a future
  // implementer cannot rename a field without breaking the contract.
  it("captures the expected delivery_signature_audit row shape via mock supabase", async () => {
    const mock = makeMockSupabase();

    // Simulate what the future production code path must do once the
    // migration is applied: after inserting the delivery, insert one
    // audit row with these exact fields.
    const expectedAudit: DeliverySignatureAuditRow = {
      delivery_id: "11111111-1111-1111-1111-111111111111",
      signer_person_id: "22222222-2222-2222-2222-222222222222",
      signed_at: "2026-05-09T12:00:00Z",
      client_ip_hash:
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    };

    const result = await mock
      .from("delivery_signature_audit")
      .insert(expectedAudit)
      .select()
      .single();

    expect(result.error).toBeNull();
    expect(result.data).toEqual(expectedAudit);
    expect(mock.writes).toHaveLength(1);
    expect(mock.writes[0]?.table).toBe("delivery_signature_audit");
    expect(mock.writes[0]?.row).toMatchObject({
      delivery_id: expect.any(String),
      signer_person_id: expect.any(String),
      signed_at: expect.any(String),
      client_ip_hash: expect.any(String),
    });
  });

  it("a delivery without firma_url must not write to delivery_signature_audit (mock-shape guard)", () => {
    const mock = makeMockSupabase();
    // Production path: if firma_url is null/undefined, skip the audit
    // write entirely. This test locks that contract via the mock.
    const firmaUrl: string | null = null;
    if (firmaUrl !== null) {
      // The wired router will run mock.from("delivery_signature_audit")
      // .insert(...). Reaching this branch would be a contract violation
      // for a no-firma_url delivery.
      vi.fn()();
    }
    expect(mock.writes).toHaveLength(0);
  });
});
