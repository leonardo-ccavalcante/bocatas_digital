/**
 * bulk-import-cap.test.ts — Phase 6 QA-9 / F-208 (W1-test F-W1T-03).
 *
 * server/routers/announcements/bulk-import.ts enforces MAX_BULK_ROWS = 10000.
 * Pre-fix this limit existed in code but had no test — a future refactor
 * could silently raise/remove it without anyone noticing until production
 * hit a 5MB CSV upload that crashed.
 *
 * The check runs before any DB call (line 43-48 of bulk-import.ts), so we
 * can exercise it via a pure tRPC caller as adminProcedure.
 */
import { describe, it, expect } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";
import { Logger } from "../_core/logger";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function adminCtx(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-user",
    email: "admin@bocatas.org",
    name: "Admin",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    logger: new Logger(),
    correlationId: "tc",
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

const HEADER = "titulo,contenido,tipo,es_urgente,fecha_inicio,fecha_fin,fijado,audiencias";

function csvWithRows(n: number): string {
  const rows: string[] = [HEADER];
  for (let i = 0; i < n; i++) {
    rows.push(`r${i},c${i},info,false,,,,beneficiario:*`);
  }
  return rows.join("\n");
}

describe("announcements.previewBulkImport — 10K row cap (F-208)", () => {
  it("rejects a CSV with 10001 data rows with BAD_REQUEST + descriptive message", async () => {
    const caller = appRouter.createCaller(adminCtx());
    try {
      await caller.announcements.previewBulkImport({
        csv: csvWithRows(10001),
      });
      expect.fail("Expected TRPCError to be thrown for >10000 rows");
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      const e = err as TRPCError;
      expect(e.code).toBe("BAD_REQUEST");
      expect(e.message).toMatch(/máximo|10000|10\.000/i);
    }
  });

  it("uses BAD_REQUEST not INTERNAL_SERVER_ERROR (correct HTTP semantics)", async () => {
    const caller = appRouter.createCaller(adminCtx());
    try {
      await caller.announcements.previewBulkImport({
        csv: csvWithRows(10500),
      });
      expect.fail("Expected TRPCError");
    } catch (err) {
      const e = err as TRPCError;
      // Wrong code on this kind of input would manifest as a 5xx client-side,
      // hiding a recoverable user error behind a "server crashed" UX.
      expect(e.code).not.toBe("INTERNAL_SERVER_ERROR");
    }
  });
});
