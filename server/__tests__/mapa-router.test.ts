/**
 * Stage S2 thin-slice — server-side toolchain proof for mapa.distritoStats.
 *
 * Asserts:
 *   • Zod input parsing accepts both layers
 *   • Output shape matches distritoStatsOutputSchema
 *   • k-anonymity floor surfaces correctly (3) and at least one row has
 *     count=null exercising the suppression path
 *   • All returned distrito slugs are valid DistritoSlug values
 *
 * S3 server-mapa Feature Agent replaces this stub with real aggregation;
 * these contract tests survive the replacement.
 */

import { describe, expect, it } from "vitest";

import type { TrpcContext } from "../_core/context";
import { Logger } from "../_core/logger";
import { isDistritoSlug } from "../../shared/madrid/distritos";
import { mapaRouter } from "../routers/mapa";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function voluntarioCtx(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "thin-slice-user",
    email: "voluntario@bocatas.org",
    name: "Voluntario",
    loginMethod: "manus",
    role: "voluntario",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    logger: new Logger(),
    correlationId: "thin-slice-test",
    // req/res are not touched by the stub procedure
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const stubCtx = voluntarioCtx();

describe("mapa.distritoStats — Stage S2 stub", () => {
  it("returns a valid payload with default layer (densidad)", async () => {
    const caller = mapaRouter.createCaller(stubCtx);
    const result = await caller.distritoStats(undefined);

    expect(result.layer).toBe("densidad");
    expect(result.kAnonymityFloor).toBe(3);
    expect(Array.isArray(result.rows)).toBe(true);
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it("accepts the compliance layer", async () => {
    const caller = mapaRouter.createCaller(stubCtx);
    const result = await caller.distritoStats({ layer: "compliance" });
    expect(result.layer).toBe("compliance");
  });

  it("every returned distrito is a valid DistritoSlug", async () => {
    const caller = mapaRouter.createCaller(stubCtx);
    const result = await caller.distritoStats({ layer: "densidad" });
    for (const row of result.rows) {
      expect(isDistritoSlug(row.distrito)).toBe(true);
    }
  });

  it("at least one row demonstrates k-anonymity suppression (count = null)", async () => {
    const caller = mapaRouter.createCaller(stubCtx);
    const result = await caller.distritoStats({ layer: "densidad" });
    const suppressed = result.rows.filter((r) => r.count === null);
    expect(suppressed.length).toBeGreaterThan(0);
  });

  it("non-suppressed rows have non-negative integer counts", async () => {
    const caller = mapaRouter.createCaller(stubCtx);
    const result = await caller.distritoStats({ layer: "densidad" });
    const visible = result.rows.filter((r) => r.count !== null);
    for (const row of visible) {
      expect(row.count).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(row.count)).toBe(true);
    }
  });

  it("rejects unknown layer values via Zod", async () => {
    const caller = mapaRouter.createCaller(stubCtx);
    await expect(
      // @ts-expect-error — intentionally passing an invalid layer to verify Zod rejects it.
      caller.distritoStats({ layer: "foo" }),
    ).rejects.toThrow();
  });
});
