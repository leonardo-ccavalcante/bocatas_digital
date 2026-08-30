/**
 * logAudit must leave a DURABLE trail (#150).
 *
 * It routed audit events only into ctx.logger — a fresh per-request Logger whose
 * in-memory buffer nothing reads (the admin LogsPage reads globalLogger, a
 * different instance). So superadmin grants / role changes / account revocations
 * left no persisted trace. logAudit now also emits one structured, PII-safe line
 * to stderr (platform-captured, greppable by correlationId / actorId).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { logAudit } from "../_core/logging-middleware";
import { Logger } from "../_core/logger";
import type { TrpcContext } from "../_core/context";

function ctx(): TrpcContext {
  return {
    user: {
      id: "actor-1", openId: "actor-1", email: "a@b.org", name: "Admin",
      loginMethod: "manus", role: "superadmin",
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    logger: new Logger(),
    correlationId: "corr-1",
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("logAudit durable sink (#150)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("emits a structured, PII-safe audit line to stderr", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logAudit(ctx(), "admin.setUserRole", { targetUserId: "u2", newRole: "superadmin" });

    expect(spy).toHaveBeenCalledTimes(1);
    const line = JSON.parse(spy.mock.calls[0][0] as string);
    expect(line).toMatchObject({
      level: "audit",
      msg: "admin.setUserRole",
      actorId: "actor-1",
      correlationId: "corr-1",
      targetUserId: "u2",
      newRole: "superadmin",
    });
    expect(typeof line.timestamp).toBe("string");
    // No PII leaked: the actor email/name must never appear in the line.
    expect(spy.mock.calls[0][0]).not.toContain("a@b.org");
    expect(spy.mock.calls[0][0]).not.toContain("Admin");
  });

  it("falls back to actorId 'unknown' when there is no user", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logAudit({ ...ctx(), user: null }, "some.action");
    const line = JSON.parse(spy.mock.calls[0][0] as string);
    expect(line.actorId).toBe("unknown");
  });
});
