/**
 * admin listUsers must paginate to exhaustion (#151).
 *
 * getStaffUsers (the permission-granting screen), assertNotLastSuperadmin, and
 * getAllUsers all fetched a single 200-row page, so with >200 accounts part of
 * the staff census was invisible — including, potentially, a superadmin the
 * last-superadmin guard must count.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import type { TrpcContext } from "../../_core/context";
import { Logger } from "../../_core/logger";

const listUsersMock = vi.fn();
vi.mock("../../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({ auth: { admin: { listUsers: listUsersMock } } })),
  createServerClient: vi.fn(),
}));

import { adminRouter } from "../admin";

function ctx(): TrpcContext {
  return {
    user: {
      id: "super-1", openId: "super-1", email: "s@b.org", name: "Super",
      loginMethod: "manus", role: "superadmin",
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    logger: new Logger(),
    correlationId: "admin-pag-test",
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function page(n: number, role: string) {
  return Array.from({ length: n }, (_, i) => ({
    id: `${role}-${i}`,
    email: `${role}${i}@b.org`,
    app_metadata: { role },
    user_metadata: { nombre: `N${i}` },
    created_at: "2026-01-01",
    last_sign_in_at: null,
  }));
}

beforeEach(() => listUsersMock.mockReset());

describe("admin listUsers pagination (#151)", () => {
  it("getStaffUsers collects staff across every page, not just the first 200", async () => {
    listUsersMock
      .mockResolvedValueOnce({ data: { users: page(200, "voluntario") }, error: null })
      .mockResolvedValueOnce({ data: { users: page(50, "admin") }, error: null })
      .mockResolvedValueOnce({ data: { users: [] }, error: null });

    const res = await adminRouter.createCaller(ctx()).getStaffUsers();

    expect(res.length).toBe(250);
    expect(listUsersMock).toHaveBeenCalledTimes(3);
  });

  it("stops on an EMPTY page, never on a short one", async () => {
    // First page short (e.g. GOTRUE_MAX_ROWS < perPage) must NOT stop paging.
    listUsersMock
      .mockResolvedValueOnce({ data: { users: page(10, "admin") }, error: null })
      .mockResolvedValueOnce({ data: { users: page(10, "voluntario") }, error: null })
      .mockResolvedValueOnce({ data: { users: [] }, error: null });

    const res = await adminRouter.createCaller(ctx()).getStaffUsers();

    expect(res.length).toBe(20);
    expect(listUsersMock).toHaveBeenCalledTimes(3);
  });

  it("getAllUsers reports the full-census total and returns the requested page slice", async () => {
    listUsersMock
      .mockResolvedValueOnce({ data: { users: page(200, "beneficiario") }, error: null })
      .mockResolvedValueOnce({ data: { users: page(30, "beneficiario") }, error: null })
      .mockResolvedValueOnce({ data: { users: [] }, error: null });

    const res = await adminRouter.createCaller(ctx()).getAllUsers({ page: 1, perPage: 50, role: "all" });

    expect(res.total).toBe(230);
    expect(res.users.length).toBe(50);
  });
});
