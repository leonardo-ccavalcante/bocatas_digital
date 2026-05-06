/**
 * audit-no-pii.test.ts — Guard test that the audit logging path does not
 * accept PII fields like email or nombre. Phase 0 fix from the deep-review
 * remediation plan: prior code did `console.log({target_email, target_nombre})`
 * which leaked PII to stdout (CLAUDE.md §Compliance violation, RGPD risk).
 *
 * After the fix, audit calls in server/routers/admin.ts pass only stable IDs
 * (targetUserId, assignedRole, etc.) and never include email or name fields.
 *
 * If this test fails, someone re-added a PII field to a logAudit() call.
 * Either remove the field or hash it before passing.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Logger } from "../_core/logger";

describe("audit() never accepts forbidden PII fields", () => {
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger();
  });

  it("audit() stores entries with audit:true marker", () => {
    logger.audit("admin.createStaffUser", {
      targetUserId: "u-123",
      assignedRole: "voluntario",
    });
    const logs = logger.getLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].audit).toBe(true);
    expect(logs[0].message).toBe("admin.createStaffUser");
    expect(logs[0].level).toBe("info"); // audit is stored at info level
  });

  it("admin.ts call sites never pass PII fields to logAudit", async () => {
    // Static check: the source of admin.ts must not contain a logAudit call
    // that includes target_email, target_nombre, email:, or nombre: in its
    // metadata object.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const adminSrc = fs.readFileSync(
      path.resolve(__dirname, "../routers/admin.ts"),
      "utf-8"
    );

    // Find every logAudit call body and check the metadata for PII fields.
    const logAuditCalls = adminSrc.match(/logAudit\([^)]+\)/gs) ?? [];
    expect(logAuditCalls.length).toBeGreaterThan(0);

    for (const call of logAuditCalls) {
      expect(call).not.toMatch(/\btarget_email\b/);
      expect(call).not.toMatch(/\btarget_nombre\b/);
      expect(call).not.toMatch(/\bemail\s*:/);
      expect(call).not.toMatch(/\bnombre\s*:/);
    }
  });

  it("admin.ts has no remaining console.log audit calls", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const adminSrc = fs.readFileSync(
      path.resolve(__dirname, "../routers/admin.ts"),
      "utf-8"
    );
    expect(adminSrc).not.toMatch(/console\.log/);
    expect(adminSrc).not.toMatch(/audit:\s*true/);
  });
});
