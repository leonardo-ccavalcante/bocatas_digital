/**
 * admin.setUserRole — role changes and the self-demotion guard.
 *
 * `server/routers/admin.ts` had NO test coverage at all, which mattered because
 * it is the write side of the contract #144 fixed on the read side: it writes
 * `auth.users.app_metadata.role`, which is now what actually grants access.
 *
 * The guard under test exists because wiring this procedure into the admin UI
 * introduced a way to lock everyone out: a superadmin demoting themselves takes
 * effect on their very next request, and if they were the last one nobody can
 * undo it — this procedure is superadmin-only and `createStaffUser` accepts only
 * `admin | voluntario`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../../_core/context";
import type { User } from "../../db";
import { Logger } from "../../_core/logger";

const updateUserById = vi.fn();

vi.mock("../../../client/src/lib/supabase/server", () => ({
  createAdminClient: () => ({ auth: { admin: { updateUserById } } }),
}));

const { adminRouter } = await import("../admin");

const SUPERADMIN_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";

function ctx(userId = SUPERADMIN_ID): TrpcContext {
  const user = {
    id: userId,
    openId: userId,
    name: "Super",
    email: "super@bocatas.test",
    loginMethod: "email",
    role: "superadmin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  } as User;
  return {
    user,
    req: { headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    logger: new Logger(),
    correlationId: "test",
  };
}

beforeEach(() => {
  updateUserById.mockReset();
  updateUserById.mockResolvedValue({ error: null });
});

describe("admin.setUserRole", () => {
  it("writes the role to app_metadata for another user", async () => {
    const caller = adminRouter.createCaller(ctx());

    const result = await caller.setUserRole({ userId: OTHER_ID, role: "admin" });

    expect(updateUserById).toHaveBeenCalledWith(OTHER_ID, {
      app_metadata: { role: "admin" },
    });
    expect(result).toEqual({ success: true, userId: OTHER_ID, role: "admin" });
  });

  it("can grant superadmin — the only path to that role in the app", async () => {
    // createStaffUser accepts admin|voluntario only, so without this there is no
    // way to appoint a superadmin from inside the application.
    const caller = adminRouter.createCaller(ctx());

    await caller.setUserRole({ userId: OTHER_ID, role: "superadmin" });

    expect(updateUserById).toHaveBeenCalledWith(OTHER_ID, {
      app_metadata: { role: "superadmin" },
    });
  });

  it("refuses a self-change, and writes nothing", async () => {
    const caller = adminRouter.createCaller(ctx());

    await expect(
      caller.setUserRole({ userId: SUPERADMIN_ID, role: "voluntario" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("refuses a self-change even when the role is unchanged", async () => {
    // Guard on identity, not on whether the value differs — otherwise the check
    // is one refactor away from being bypassable.
    const caller = adminRouter.createCaller(ctx());

    await expect(
      caller.setUserRole({ userId: SUPERADMIN_ID, role: "superadmin" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("rejects a non-superadmin caller", async () => {
    const nonSuper = ctx(OTHER_ID);
    (nonSuper.user as User).role = "admin";
    const caller = adminRouter.createCaller(nonSuper);

    await expect(
      caller.setUserRole({ userId: SUPERADMIN_ID, role: "voluntario" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("surfaces a Supabase failure instead of reporting success", async () => {
    updateUserById.mockResolvedValue({ error: { message: "boom" } });
    const caller = adminRouter.createCaller(ctx());

    await expect(
      caller.setUserRole({ userId: OTHER_ID, role: "admin" })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});
