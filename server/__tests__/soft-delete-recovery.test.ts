import { describe, it, expect } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";
import { Logger } from "../_core/logger";

function createAdminContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "admin-user",
      email: "admin@test.com",
      name: "Admin User",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    logger: new Logger(),
    correlationId: "test-correlation-id",
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as unknown as TrpcContext["res"],
  };
}

function createUserContext(): TrpcContext {
  return {
    user: {
      id: 2,
      openId: "user",
      email: "user@test.com",
      name: "Regular User",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    logger: new Logger(),
    correlationId: "test-correlation-id",
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as unknown as TrpcContext["res"],
  };
}

describe("Soft-Delete Recovery Procedures", () => {
  const adminCaller = appRouter.createCaller(createAdminContext());
  const userCaller = appRouter.createCaller(createUserContext());

  it("lists soft-deleted families with metadata", async () => {
    const result = await adminCaller.admin.softDelete.listDeletedFamilies({
      limit: 10,
      offset: 0,
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.total).toBeGreaterThanOrEqual(0);
    if (result.items.length > 0) {
      expect(result.items[0]).toHaveProperty("id");
      expect(result.items[0]).toHaveProperty("deleted_at");
      expect(result.items[0]).toHaveProperty("familia_numero");
    }
  });

  it("requires admin role for listing deleted families", async () => {
    await expect(
      userCaller.admin.softDelete.listDeletedFamilies({ limit: 10, offset: 0 })
    ).rejects.toThrow("FORBIDDEN");
  });

  it("lists soft-deleted persons with metadata", async () => {
    const result = await adminCaller.admin.softDelete.listDeletedPersons({
      limit: 10,
      offset: 0,
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.total).toBeGreaterThanOrEqual(0);
  });

  it("requires admin role for listing deleted persons", async () => {
    await expect(
      userCaller.admin.softDelete.listDeletedPersons({ limit: 10, offset: 0 })
    ).rejects.toThrow("FORBIDDEN");
  });

  it("requires admin role for getting deleted family details", async () => {
    await expect(
      userCaller.admin.softDelete.getDeletedFamilyDetails({
        familyId: "test-id",
      })
    ).rejects.toThrow("FORBIDDEN");
  });

  it("requires admin role for restoring family", async () => {
    await expect(
      userCaller.admin.softDelete.restoreFamily({
        familyId: "test-id",
      })
    ).rejects.toThrow("FORBIDDEN");
  });

  it("requires admin role for restoring person", async () => {
    await expect(
      userCaller.admin.softDelete.restorePerson({
        personId: "test-id",
      })
    ).rejects.toThrow("FORBIDDEN");
  });
});
