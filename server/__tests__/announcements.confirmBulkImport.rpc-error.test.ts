/**
 * announcements.confirmBulkImport.rpc-error.test.ts
 *
 * Regression guard: when the Postgres RPC `confirm_bulk_announcement_import`
 * returns an error, confirmBulkImport must THROW a TRPCError (INTERNAL_SERVER_ERROR)
 * — not silently return `{ created_count: 0 }` which the UI shows as success.
 *
 * Fully DB-free: createAdminClient is mocked at the module level so Supabase
 * env vars are never required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

// ─── Module-level mocks (must be hoisted before imports) ─────────────────────

// We need two independent mock call chains: one for fetching the preview, one for
// the RPC call, and one for the delete cleanup.  We use a factory function so
// each `createAdminClient()` call returns the same stub and we can swap the
// per-call behaviour per test.

type FromResult = Record<string, unknown>;

// Mutable stubs replaced per-test in beforeEach
const mockSelect = vi.fn();
const mockRpc = vi.fn();
const mockDelete = vi.fn();
const mockInsert = vi.fn();

vi.mock("../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "bulk_import_previews") {
        return {
          // preview fetch chain: .select().eq().eq().gte().maybeSingle()
          select: () => ({
            eq: () => ({
              eq: () => ({
                gte: () => ({
                  maybeSingle: mockSelect,
                }),
              }),
            }),
          }),
          // preview delete chain: .delete().eq()
          delete: () => ({ eq: mockDelete }),
        };
      }
      // announcement_webhook_log insert (not reached in these tests)
      return { insert: mockInsert };
    }),
    // RPC call
    rpc: mockRpc,
  })),
}));

// Import AFTER vi.mock so the hoisted factory is in place.
import { bulkImportRouter } from "../routers/announcements/bulk-import";

// ─── Minimal admin context ────────────────────────────────────────────────────

const ADMIN_CTX = {
  user: {
    id: 1,
    openId: "test-open-id",
    name: "Test Admin",
    email: "admin@bocatas.org",
    role: "admin" as const,
    loginMethod: "test",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  },
  req: {} as never,
  res: {} as never,
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } as never,
  correlationId: "test-correlation-id",
};

const VALID_TOKEN = "550e8400-e29b-41d4-a716-446655440000";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("confirmBulkImport — RPC error throws TRPCError", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: preview fetch succeeds with a minimal row
    mockSelect.mockResolvedValue({
      data: {
        token: VALID_TOKEN,
        parsed_rows: [
          {
            titulo: "Test",
            contenido: "Test contenido",
            tipo: "info",
            es_urgente: false,
            fijado: false,
            audiencias: [{ roles: [], programs: [] }],
            row_number: 2,
          },
        ],
        created_by: "1",
        created_at: new Date().toISOString(),
      },
      error: null,
    });

    // Default: delete succeeds
    mockDelete.mockResolvedValue({ error: null });
  });

  it("throws TRPCError(INTERNAL_SERVER_ERROR) when the RPC returns an error", async () => {
    // Arrange: RPC fails
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "some postgres error", code: "P0001" },
    });

    const caller = bulkImportRouter.createCaller(ADMIN_CTX);

    // Act & Assert
    await expect(
      caller.confirmBulkImport({ preview_token: VALID_TOKEN })
    ).rejects.toThrow(TRPCError);
  });

  it("the thrown error has code INTERNAL_SERVER_ERROR", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "connection error", code: "XX000" },
    });

    const caller = bulkImportRouter.createCaller(ADMIN_CTX);

    let caught: unknown;
    try {
      await caller.confirmBulkImport({ preview_token: VALID_TOKEN });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(TRPCError);
    expect((caught as TRPCError).code).toBe("INTERNAL_SERVER_ERROR");
  });

  it("still deletes the preview before throwing (cleanup on failure)", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "rpc exploded", code: "XX000" },
    });

    const caller = bulkImportRouter.createCaller(ADMIN_CTX);

    await expect(
      caller.confirmBulkImport({ preview_token: VALID_TOKEN })
    ).rejects.toBeInstanceOf(TRPCError);

    // The delete stub must have been called with the preview token
    expect(mockDelete).toHaveBeenCalledWith("token", VALID_TOKEN);
  });

  it("does NOT throw and returns created_count when the RPC succeeds", async () => {
    mockRpc.mockResolvedValue({
      data: { created_count: 3, error_count: 0 },
      error: null,
    });

    const caller = bulkImportRouter.createCaller(ADMIN_CTX);
    const result = await caller.confirmBulkImport({ preview_token: VALID_TOKEN });

    expect(result.created_count).toBe(3);
    expect(result.error_count).toBe(0);
  });
});
