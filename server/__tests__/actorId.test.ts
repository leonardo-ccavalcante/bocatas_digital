/**
 * authActorId (#145) — the acting user's id for registrado_por, which
 * FK-references auth.users(id). A real staff id passes through; the
 * DEV_ADMIN_LOGIN synthetic id ("dev-admin-uuid") is not a real auth.users row,
 * so it must resolve to null rather than 23503 the check-in in dev.
 */
import { describe, it, expect } from "vitest";
import { authActorId } from "../_core/actorId";
import type { User } from "../db";

function user(id: string): User {
  return {
    id, openId: id, name: "X", email: "x@b.org", loginMethod: "manus",
    role: "voluntario", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
  } as User;
}

describe("authActorId (#145)", () => {
  it("returns a real auth UUID unchanged", () => {
    const id = "3f1c0a5e-2b7d-4c8a-9e10-5d6b7c8a9f01";
    expect(authActorId(user(id))).toBe(id);
  });

  it("returns null for the DEV_ADMIN_LOGIN synthetic id", () => {
    expect(authActorId(user("dev-admin-uuid"))).toBeNull();
  });

  it("returns null when there is no user", () => {
    expect(authActorId(null)).toBeNull();
  });
});
