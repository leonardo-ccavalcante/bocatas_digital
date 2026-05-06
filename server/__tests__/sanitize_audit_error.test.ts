/**
 * sanitize_audit_error.test.ts — Direct tests against the live Supabase
 * project's `sanitize_audit_error` SQL function.
 *
 * The function strips potentially-PII fragments from a Postgres SQLERRM
 * before persistence in `family_legacy_import_audit.notes`. We validate
 * the strip rules against realistic constraint-error messages that pg
 * actually emits for the legacy-import flow:
 *   - DNI: 8 digits + letter   ("12345678A")
 *   - NIE: X|Y|Z + 7 digits + letter   ("Y6802248N")
 *   - parenthesised key=value pairs ("(numero_documento)=(...)")
 *   - quoted enum value rejections ('invalid input value for enum X: "..."')
 *
 * Gated on SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env so the test does
 * not require local supabase. Runs as a query — no DML.
 */
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const isLive = Boolean(url && key);

describe("sanitize_audit_error SQL function", () => {
  if (!isLive) {
    it.skip("requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to run live", () => {});
    return;
  }

  const db = createClient(url!, key!, { auth: { persistSession: false } });

  async function sanitize(msg: string): Promise<string> {
    const { data, error } = await db.rpc("sanitize_audit_error" as never, {
      p_msg: msg,
    } as never);
    if (error) throw new Error(error.message);
    return data as unknown as string;
  }

  it("masks DNI (8 digits + letter) inside parenthesised key=value", async () => {
    const result = await sanitize(
      'duplicate key value violates unique constraint "persons_doc_uniq" (numero_documento)=(12345678A)'
    );
    expect(result).not.toContain("12345678");
    expect(result).toContain("(redacted)");
  });

  it("masks naked NIE completely (no letter prefix/suffix leak)", async () => {
    // v2 (migration 20260601000005): the full NIE token — letter prefix +
    // digit run + check letter — is replaced by `***` in a single match.
    const naked = await sanitize("NIE Y6802248N is already registered");
    expect(naked).not.toContain("Y6802248N");
    expect(naked).not.toContain("Y6802248");
    expect(naked).not.toContain("6802248N");
    expect(naked).toContain("***");
  });

  it("masks naked DNI completely (8 digits + letter)", async () => {
    const naked = await sanitize("persona DNI 12345678A registered");
    expect(naked).not.toContain("12345678A");
    expect(naked).not.toContain("12345678");
    expect(naked).toContain("***");
  });

  it("masks NIE inside (...)=(...) constraint wrappers", async () => {
    const wrapped = await sanitize(
      "duplicate key value (numero_documento)=(Y6802248N)"
    );
    expect(wrapped).not.toContain("Y6802248N");
    expect(wrapped).toContain("(redacted)");
  });

  it("does NOT trigger on short alphanumerics (false-positive guard)", async () => {
    // 3-digit run + letter must NOT match the DNI pattern (\d{7,8}[A-Z]).
    const result = await sanitize("error code ABC123Z something");
    expect(result).toContain("ABC123Z");
  });

  it("masks quoted strings (enum cast failures)", async () => {
    const result = await sanitize(
      'invalid input value for enum tipo_documento: "NIE_EXPIRED_2019"'
    );
    expect(result).not.toContain("NIE_EXPIRED_2019");
    expect(result).toContain('"***"');
  });

  it("returns input unchanged when nothing matches", async () => {
    const benign = "transaction aborted";
    expect(await sanitize(benign)).toBe(benign);
  });

  it("handles null / empty input", async () => {
    expect(await sanitize("")).toBe("");
  });

  it("strips runs of 6+ consecutive digits even outside wrappers (phone-like)", async () => {
    const result = await sanitize("phone 600100200 not unique");
    expect(result).not.toContain("600100200");
    expect(result).toContain("******");
  });

  it("does NOT strip 5-digit runs (postal codes) — by design", async () => {
    // Spanish postal codes are 5 digits. The regex \d{6,} requires at
    // least 6, so postal codes survive. This is intentional: 5 digits
    // alone is low-information.
    const result = await sanitize("CP 28020 not found");
    expect(result).toContain("28020");
  });
});
