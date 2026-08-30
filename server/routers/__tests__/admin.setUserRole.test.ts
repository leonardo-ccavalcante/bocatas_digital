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
const listUsers = vi.fn();

vi.mock("../../../client/src/lib/supabase/server", () => ({
  createAdminClient: () => ({ auth: { admin: { updateUserById, listUsers } } }),
}));

const { adminRouter } = await import("../admin");

// Deliberately contains hex LETTERS: a digits-only uuid is unchanged by
// toUpperCase(), which would make the casing tests vacuously pass.
const SUPERADMIN_ID = "3f1c0a5e-2b7d-4c8a-9e10-5d6b7c8a9f01";
const OTHER_ID = "a4d2e6b8-1c3f-4a5b-8d7e-9f0a1b2c3d4e";
const SECOND_SUPER_ID = "b5e3f7c9-2d4a-4b6c-9e8f-0a1b2c3d4e5f";

/**
 * What auth.admin.listUsers returns — only role and id matter to the guard.
 * The guard now paginates to exhaustion (#151), so the census comes back on the
 * first page and every subsequent page is empty to terminate the loop.
 */
function withSuperadmins(...ids: string[]) {
  listUsers.mockReset();
  listUsers
    .mockResolvedValueOnce({
      data: {
        users: [
          ...ids.map((id) => ({ id, app_metadata: { role: "superadmin" } })),
          { id: OTHER_ID, app_metadata: { role: "voluntario" } },
        ],
      },
      error: null,
    })
    .mockResolvedValue({ data: { users: [] }, error: null });
}

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
  listUsers.mockReset();
  // Two superadmins by default, so the last-superadmin guard is not what a test
  // trips over unless it means to.
  withSuperadmins(SUPERADMIN_ID, SECOND_SUPER_ID);
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

  it("refuses a self-change sent with an UPPERCASE uuid", async () => {
    // `uuidLike` carries the /i flag, so an uppercased uuid passes validation and
    // resolves to the SAME Postgres row — but a case-sensitive `===` does not
    // match it. That walked straight past the guard.
    const caller = adminRouter.createCaller(ctx());

    await expect(
      caller.setUserRole({ userId: SUPERADMIN_ID.toUpperCase(), role: "voluntario" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(updateUserById).not.toHaveBeenCalled();
  });
});

describe("admin.setUserRole — last superadmin", () => {
  it("refuses to demote the last superadmin", async () => {
    // Blocking self-demotion is not enough: superadmin A demoting superadmin B
    // is just as final when B is the only one left.
    withSuperadmins(SECOND_SUPER_ID);
    const caller = adminRouter.createCaller(ctx());

    await expect(
      caller.setUserRole({ userId: SECOND_SUPER_ID, role: "voluntario" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("allows demoting a superadmin while another remains", async () => {
    withSuperadmins(SUPERADMIN_ID, SECOND_SUPER_ID);
    const caller = adminRouter.createCaller(ctx());

    await caller.setUserRole({ userId: SECOND_SUPER_ID, role: "admin" });

    expect(updateUserById).toHaveBeenCalled();
  });

  it("matches the last superadmin case-insensitively", async () => {
    withSuperadmins(SECOND_SUPER_ID);
    const caller = adminRouter.createCaller(ctx());

    await expect(
      caller.setUserRole({ userId: SECOND_SUPER_ID.toUpperCase(), role: "voluntario" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("does not block changing a NON-superadmin when only one superadmin exists", async () => {
    withSuperadmins(SUPERADMIN_ID);
    const caller = adminRouter.createCaller(ctx());

    await caller.setUserRole({ userId: OTHER_ID, role: "admin" });

    expect(updateUserById).toHaveBeenCalled();
  });
});

describe("admin.revokeStaffAccess — same guards", () => {
  it("refuses self-revocation", async () => {
    // The UI hides the revoke button on superadmin rows, but that binds nothing
    // for a direct API call. This procedure had no server-side guard at all.
    const caller = adminRouter.createCaller(ctx());

    await expect(
      caller.revokeStaffAccess({ userId: SUPERADMIN_ID })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("refuses self-revocation with an UPPERCASE uuid", async () => {
    const caller = adminRouter.createCaller(ctx());

    await expect(
      caller.revokeStaffAccess({ userId: SUPERADMIN_ID.toUpperCase() })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("refuses to revoke the last superadmin", async () => {
    withSuperadmins(SECOND_SUPER_ID);
    const caller = adminRouter.createCaller(ctx());

    await expect(
      caller.revokeStaffAccess({ userId: SECOND_SUPER_ID })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("still revokes an ordinary staff user", async () => {
    const caller = adminRouter.createCaller(ctx());

    const result = await caller.revokeStaffAccess({ userId: OTHER_ID });

    expect(updateUserById).toHaveBeenCalledWith(OTHER_ID, {
      app_metadata: { role: null },
    });
    expect(result).toEqual({ success: true, userId: OTHER_ID });
  });
});
