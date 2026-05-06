import { describe, it, expect, beforeEach, vi } from "vitest";
import { familySavedViewsRouter } from "../familySavedViews";
import type { TrpcContext } from "../../_core/context";
import type { User } from "../../../drizzle/schema";

function buildUser(role: User["role"], id = 1): User {
  return {
    id,
    openId: `manus-${id}`,
    name: "Test User",
    email: "test@example.com",
    loginMethod: "manus",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  } as User;
}

function buildCtx(user: User | null): TrpcContext {
  return {
    req: {} as never,
    res: {} as never,
    user,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
    correlationId: "test-correlation-id",
  };
}

describe("familySavedViews router", () => {
  beforeEach(() => vi.resetAllMocks());

  it("rejects voluntario from list", async () => {
    const caller = familySavedViewsRouter.createCaller(buildCtx(buildUser("voluntario")));
    await expect(caller.list({ programaId: "00000000-0000-0000-0000-000000000001" }))
      .rejects.toThrow(/FORBIDDEN|UNAUTHORIZED|admin|permission|10002/i);
  });

  it("rejects unauthenticated callers from list", async () => {
    const caller = familySavedViewsRouter.createCaller(buildCtx(null));
    await expect(caller.list({ programaId: "00000000-0000-0000-0000-000000000001" }))
      .rejects.toThrow(/FORBIDDEN|UNAUTHORIZED|permission|10002/i);
  });

  it("validates filters_json shape — rejects unknown keys", async () => {
    const caller = familySavedViewsRouter.createCaller(buildCtx(buildUser("admin")));
    await expect(caller.create({
      programaId: "00000000-0000-0000-0000-000000000001",
      nombre: "Activas",
      // @ts-expect-error — invalid shape on purpose
      filtersJson: { invalidField: 1 },
      isShared: false,
    })).rejects.toThrow();
  });

  it("accepts a valid filters_json shape (Zod-only validation; DB call may fail in test env)", async () => {
    const caller = familySavedViewsRouter.createCaller(buildCtx(buildUser("admin")));
    // We assert the call doesn't throw a Zod error. A downstream DB error is fine —
    // we just want to ensure the input shape passes the schema.
    let zodFailed = false;
    try {
      await caller.create({
        programaId: "00000000-0000-0000-0000-000000000001",
        nombre: "Activas",
        filtersJson: { estado: "activa" },
        isShared: false,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/Invalid input|filters_json/i.test(msg)) zodFailed = true;
    }
    expect(zodFailed).toBe(false);
  });

  it("update requires id; rejects without it", async () => {
    const caller = familySavedViewsRouter.createCaller(buildCtx(buildUser("admin")));
    await expect(
      // @ts-expect-error — missing id on purpose
      caller.update({ nombre: "x" })
    ).rejects.toThrow();
  });
});
