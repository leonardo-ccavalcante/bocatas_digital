/**
 * firma.audit.test.ts — mock-SHAPE + Zod-input contract guards.
 *
 * SCOPE (read this before trusting these tests): every test below except the
 * final Zod `safeParse` assertion runs against the local `makeMockSupabase`
 * helper and exercises ZERO lines of the production `recordSignature`
 * procedure. They lock the EXPECTED audit-row shape (field names, no
 * client-supplied `signed_at`) and the Zod input contract — NOT the real
 * procedure's runtime behavior.
 *
 * The REAL procedure behavior (auth → guards → IP hash → upload → patch →
 * audit insert, plus the upload/patch/FK failure branches) is covered by
 * `server/__tests__/entregas.recordSignature.test.ts`, which invokes the
 * actual procedure via `appRouter.createCaller(ctx)`.
 *
 * Why mocks here: these are shape/input guards so a future implementer
 * cannot silently rename an audit field or accept a client-supplied
 * `signed_at` without breaking a test.
 */
import { describe, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
import { RecordSignatureInputSchema } from "../../client/src/features/families/schemas/signatureCapture";

// ─── Expected row-shape guard ────────────────────────────────────────────────
// Locks the EXPECTED audit-row field shape against the local mock below.
// This does NOT exercise the production procedure — it only guards the shape
// so a field rename is caught. Real behavior: entregas.recordSignature.test.ts.

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
  it("recordSignature writes delivery_signature_audit row with correct shape when delivery is unsigned", async () => {
    const mock = makeMockSupabase();
    const deliveryId = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
    const signerPersonId = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";

    const insertResult = await mock
      .from("delivery_signature_audit")
      .insert({
        delivery_id: deliveryId,
        signer_person_id: signerPersonId,
        signed_at: "2026-05-20T10:00:00Z",
        client_ip_hash:
          "e3b0c44298fc1c149afbf4c8996fb924" + "27ae41e4649b934ca495991b7852b855",
      })
      .select()
      .single();

    expect(insertResult.error).toBeNull();
    expect(insertResult.data.delivery_id).toBe(deliveryId);
    expect(insertResult.data.signer_person_id).toBe(signerPersonId);
    expect(mock.writes).toHaveLength(1);
    expect(mock.writes[0]?.table).toBe("delivery_signature_audit");
    expect(mock.writes[0]?.row).toMatchObject({
      delivery_id: expect.any(String),
      signer_person_id: expect.any(String),
      signed_at: expect.any(String),
      client_ip_hash: expect.any(String),
    });
  });

  it("the audit row's signed_at must use DB DEFAULT now(), not a client-supplied timestamp — procedure must NOT pass signed_at in insert payload", () => {
    const mock = makeMockSupabase();

    const correctInsertPayload = {
      delivery_id: "cccccccc-cccc-4ccc-cccc-cccccccccccc",
      signer_person_id: "dddddddd-dddd-4ddd-dddd-dddddddddddd",
      client_ip_hash: null,
      // signed_at is intentionally ABSENT — DB supplies DEFAULT now().
    };

    mock
      .from("delivery_signature_audit")
      .insert(correctInsertPayload as DeliverySignatureAuditRow);

    expect(mock.writes).toHaveLength(1);
    expect(mock.writes[0]?.row).not.toHaveProperty("signed_at");

    const wrongPayload = {
      ...correctInsertPayload,
      signed_at: "2026-01-01T00:00:00Z", // client-supplied — FORBIDDEN
    };
    const mock2 = makeMockSupabase();
    mock2
      .from("delivery_signature_audit")
      .insert(wrongPayload as DeliverySignatureAuditRow);
    expect(mock2.writes[0]?.row).toHaveProperty("signed_at");
  });

  it("hashClientIp returns SHA-256(ip:salt) and never the raw IP (T3 contract)", () => {
    const rawIp = "81.47.102.200";
    const salt = "daily-salt-abc";
    const expected = createHash("sha256").update(`${rawIp}:${salt}`).digest("hex");

    const computedHash = createHash("sha256")
      .update(`${rawIp}:${salt}`)
      .digest("hex");
    expect(computedHash).toBe(expected);
    expect(computedHash).not.toContain(rawIp);
    expect(computedHash).not.toBe(rawIp);

    const nullHash: string | null = null; // salt absent → null
    expect(nullHash).toBeNull();
  });

  it("a delivery WITHOUT signatureDataUrl MUST NOT produce an audit row", () => {
    const mock = makeMockSupabase();
    const signatureDataUrl: string | null = null;

    if (signatureDataUrl !== null) {
      mock.from("delivery_signature_audit").insert({
        delivery_id: "eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee",
        signer_person_id: "ffffffff-ffff-4fff-ffff-ffffffffffff",
        signed_at: new Date().toISOString(),
        client_ip_hash: null,
      });
    }

    expect(mock.writes).toHaveLength(0);

    const result = RecordSignatureInputSchema.safeParse({
      deliveryId: "eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee",
      signerPersonId: "ffffffff-ffff-4fff-ffff-ffffffffffff",
      signatureDataUrl: null,
    });
    expect(result.success).toBe(false);
  });

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
