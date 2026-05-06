/**
 * checkin.missingItems.test.ts — Server contract lock for the
 * `checkin.verifyAndInsert` success response.
 *
 * Phase A.2.4: this test pins the *current* shape of the registered-result
 * envelope so a future Phase B can intentionally extend it with a
 * `missingItems` field.
 *
 *   Today's success envelope:
 *     { status: "registered", restriccionesAlimentarias: string | null }
 *     { status: "duplicate", lastCheckinTime: string }
 *     { status: "not_found" }
 *
 * If/when `missingItems` is added in Phase B, this file should be updated
 * to require its presence. For Phase A.2 we only flag its absence.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { checkinRouter } from "../checkin";

describe("checkin.verifyAndInsert — Phase A response contract", () => {
  it("exposes the verifyAndInsert procedure", () => {
    expect(checkinRouter._def.procedures).toHaveProperty("verifyAndInsert");
  });

  it("does NOT yet ship a `missingItems` field on the success envelope (Phase B will add it)", () => {
    // Static-source assertion: parse the router source and confirm the
    // registered branch returns only { status, restriccionesAlimentarias }.
    // Using source inspection (rather than executing the procedure) keeps
    // this test hermetic — no Supabase or env wiring required.
    const routerPath = path.resolve(__dirname, "..", "checkin.ts");
    const source = fs.readFileSync(routerPath, "utf8");

    const registeredReturnRe =
      /return\s*\{\s*status:\s*"registered"\s*as\s*const,\s*restriccionesAlimentarias:[^}]+\};/;
    expect(source).toMatch(registeredReturnRe);

    // FLAG: `missingItems` is intentionally absent today. Phase B owners must
    // delete this assertion (and the regex above) and replace it with a
    // positive assertion once the field ships.
    expect(source).not.toMatch(/missingItems\s*:/);
  });

  it("documents the three registered/duplicate/not_found status branches", () => {
    const routerPath = path.resolve(__dirname, "..", "checkin.ts");
    const source = fs.readFileSync(routerPath, "utf8");
    expect(source).toMatch(/status:\s*"registered"/);
    expect(source).toMatch(/status:\s*"duplicate"/);
    expect(source).toMatch(/status:\s*"not_found"/);
  });
});
