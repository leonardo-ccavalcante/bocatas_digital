/**
 * entregas.updateDelivery / deleteDelivery — ownership + audit (#171 / F080).
 *
 * Both are voluntarioProcedure. Under ADR-0002 the tRPC guard is the only wall,
 * so a voluntario must only mutate deliveries they registered; admin+ may act on
 * any. Every mutation is audited.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import type { TrpcContext } from "../../../_core/context";
import { Logger } from "../../../_core/logger";

const fromMock = vi.fn();
vi.mock("../../../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({ from: fromMock })),
  createServerClient: vi.fn(),
}));

import type * as LoggingMiddleware from "../../../_core/logging-middleware";
const auditSpy = vi.fn();
vi.mock("../../../_core/logging-middleware", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof LoggingMiddleware;
  return { ...actual, logAudit: (...args: unknown[]) => auditSpy(...args) };
});

import { crudRouter } from "../crud";

type AuthUser = NonNullable<TrpcContext["user"]>;
function ctxWithRole(role: AuthUser["role"], id = "test-user-42"): TrpcContext {
  return {
    user: {
      id, openId: "u", email: `${role}@bocatas.org`, name: role, loginMethod: "manus",
      role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    logger: new Logger(),
    correlationId: "entregas-authz-test",
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const DELIVERY_ID = "33333333-3333-4333-8333-333333333333";
const ownerSelectChain = (registrado_por: string | null) => ({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  is: vi.fn().mockReturnThis(),
  single: vi.fn(() => Promise.resolve({ data: { registrado_por }, error: null })),
});
const writeChain = () => ({
  update: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  is: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  single: vi.fn(() => Promise.resolve({ data: { id: DELIVERY_ID }, error: null })),
});

beforeEach(() => {
  fromMock.mockReset();
  auditSpy.mockReset();
});

describe("entregas mutation ownership (#171 F080)", () => {
  it("FORBIDs a voluntario editing a delivery they did not register", async () => {
    fromMock.mockReturnValueOnce(ownerSelectChain("other-user"));
    const caller = crudRouter.createCaller(ctxWithRole("voluntario"));
    await expect(
      caller.updateDelivery({ id: DELIVERY_ID, updates: { notas: "x" } })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(auditSpy).not.toHaveBeenCalled();
  });

  it("FORBIDs a voluntario deleting a delivery they did not register", async () => {
    fromMock.mockReturnValueOnce(ownerSelectChain("other-user"));
    const caller = crudRouter.createCaller(ctxWithRole("voluntario"));
    await expect(caller.deleteDelivery({ id: DELIVERY_ID })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("allows a voluntario to edit their own delivery and audits it", async () => {
    fromMock.mockReturnValueOnce(ownerSelectChain("test-user-42"));
    fromMock.mockReturnValueOnce(writeChain());
    const caller = crudRouter.createCaller(ctxWithRole("voluntario"));
    const res = await caller.updateDelivery({ id: DELIVERY_ID, updates: { notas: "x" } });
    expect(res.success).toBe(true);
    expect(auditSpy).toHaveBeenCalledWith(expect.anything(), "entregas.updateDelivery", { deliveryId: DELIVERY_ID });
  });

  it("allows an admin to edit any delivery", async () => {
    fromMock.mockReturnValueOnce(ownerSelectChain("someone-else"));
    fromMock.mockReturnValueOnce(writeChain());
    const caller = crudRouter.createCaller(ctxWithRole("admin"));
    const res = await caller.updateDelivery({ id: DELIVERY_ID, updates: { notas: "x" } });
    expect(res.success).toBe(true);
  });

  it("returns NOT_FOUND when the delivery does not exist", async () => {
    fromMock.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      single: vi.fn(() => Promise.resolve({ data: null, error: { message: "no rows" } })),
    });
    const caller = crudRouter.createCaller(ctxWithRole("voluntario"));
    await expect(caller.deleteDelivery({ id: DELIVERY_ID })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
