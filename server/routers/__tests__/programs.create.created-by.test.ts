/**
 * programs.create.created-by.test.ts — Pin the contract for `programs.create`
 * after migration 20260507000001 converted `programs.created_by` from
 * `uuid REFERENCES auth.users(id)` to `text`.
 *
 * Background
 *   `server/routers/programs.ts:142` writes `String(ctx.user.id)` (a stringified
 *   MySQL int from the Manus OAuth `users` table) into `programs.created_by`.
 *   Before the migration, the column was `uuid` and Postgres rejected the
 *   write with 22P02. After the migration, the column is `text` and the same
 *   write succeeds.
 *
 *   This test pins the application-side contract: the insert payload sent to
 *   Supabase MUST include `created_by` as the stringified caller id, so that
 *   future regressions (e.g. someone "fixing" the column type back to uuid,
 *   or removing the cast) get caught.
 *
 * Test strategy
 *   Mock `createAdminClient` so we capture the insert payload without needing
 *   a running Supabase. Assert payload shape; do NOT exercise the actual DB.
 *   The Postgres-level type-check is enforced by the migration itself.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TrpcContext } from "../../_core/context";
import { Logger } from "../../_core/logger";
import type { User } from "../../../drizzle/schema";

// Capture the insert payload so we can assert its shape.
let capturedPayload: Record<string, unknown> | null = null;

vi.mock("../../../client/src/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: (_table: string) => ({
      insert: (payload: Record<string, unknown>) => {
        capturedPayload = payload;
        return {
          select: () => ({
            single: async () => ({
              data: { id: "11111111-1111-4111-8111-111111111111", ...payload },
              error: null,
            }),
          }),
        };
      },
    }),
  }),
}));

function buildAdminUser(): User {
  return {
    id: 42,
    openId: "manus-admin-openid",
    email: "admin@example.com",
    name: "Admin Fixture",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
}

function buildContext(user: User | null): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    logger: new Logger(),
    correlationId: "test-correlation-id",
  };
}

describe("programs.create — created_by payload contract", () => {
  beforeEach(() => {
    capturedPayload = null;
  });

  it("writes String(ctx.user.id) into created_by (text column post-migration)", async () => {
    const { programsRouter } = await import("../programs");
    const caller = programsRouter.createCaller(buildContext(buildAdminUser()));

    await caller.create({
      slug: "test_slug",
      name: "Test Program",
      icon: "🧪",
      is_default: false,
      is_active: true,
      display_order: 99,
      volunteer_can_access: true,
      volunteer_can_write: true,
      volunteer_visible_fields: [],
      requires_consents: [],
      config: {},
    });

    expect(capturedPayload).not.toBeNull();
    // The contract: created_by is the stringified caller.id (a Manus MySQL int).
    // After migration 20260507000001 the column is `text`, so this is the
    // canonical value to write.
    expect(capturedPayload?.created_by).toBe("42");
  });
});
