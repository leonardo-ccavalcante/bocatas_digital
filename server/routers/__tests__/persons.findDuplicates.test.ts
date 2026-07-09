/**
 * persons.findDuplicates.test.ts — TDD tests for the persons.findDuplicates
 * tRPC procedure.
 *
 * Root cause: find_duplicate_persons Supabase RPC has EXECUTE revoked from
 * PUBLIC and authenticated (migration 20260506000007). The frontend was calling
 * supabase.rpc("find_duplicate_persons") directly with the anon key → 401.
 *
 * Fix: move the call to a server-side tRPC procedure that uses createAdminClient
 * (service_role), which retains EXECUTE.
 *
 * Behavior under test:
 *   1. Returns an array of DuplicateCandidate objects on success.
 *   2. Returns empty array when Supabase RPC returns no data.
 *   3. Throws TRPCError(INTERNAL_SERVER_ERROR) when RPC call fails.
 *   4. Requires authentication (protectedProcedure).
 *   5. Uses createAdminClient (service_role), NOT the anon client.
 *
 * Mocking pattern: same as persons.dedup.test.ts — vi.mock on the Supabase
 * server module so we never construct a real Supabase client.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

// ── Mock Supabase admin client ─────────────────────────────────────────────
const rpcMock = vi.fn();

vi.mock("../../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({ rpc: rpcMock })),
  createServerClient: vi.fn(),
}));

// Import AFTER vi.mock is registered.
import { findDuplicatesHandler } from "../persons/crud";
import { createAdminClient } from "../../../client/src/lib/supabase/server";

beforeEach(() => {
  rpcMock.mockReset();
  vi.mocked(createAdminClient).mockClear();
});

// ── Helper types ───────────────────────────────────────────────────────────
interface RpcResult {
  data: Array<{
    id: string;
    nombre: string;
    apellidos: string;
    fecha_nacimiento: string | null;
    foto_perfil_url: string | null;
    similarity: number;
  }> | null;
  error: { message: string; code?: string } | null;
}

describe("findDuplicatesHandler — server-side duplicate check", () => {
  it("returns an array of duplicate candidates on success", async () => {
    const mockData = [
      {
        id: "abc-123",
        nombre: "Juan",
        apellidos: "García",
        fecha_nacimiento: "1990-01-01",
        foto_perfil_url: null,
        similarity: 0.85,
      },
    ];
    rpcMock.mockResolvedValue({ data: mockData, error: null } as RpcResult);

    const result = await findDuplicatesHandler({
      nombre: "Juan",
      apellidos: "Garcia",
      threshold: 0.7,
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("abc-123");
    expect(result[0].similarity).toBe(0.85);
  });

  it("returns empty array when RPC returns null data", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null } as RpcResult);

    const result = await findDuplicatesHandler({
      nombre: "NonExistent",
      apellidos: "Person",
      threshold: 0.7,
    });

    expect(result).toEqual([]);
  });

  it("returns empty array when RPC returns empty array", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null } as RpcResult);

    const result = await findDuplicatesHandler({
      nombre: "NoMatch",
      apellidos: "Test",
      threshold: 0.7,
    });

    expect(result).toEqual([]);
  });

  it("throws TRPCError(INTERNAL_SERVER_ERROR) when RPC call fails", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "permission denied for function find_duplicate_persons", code: "42501" },
    } as RpcResult);

    await expect(
      findDuplicatesHandler({
        nombre: "Test",
        apellidos: "User",
        threshold: 0.7,
      })
    ).rejects.toThrow(TRPCError);
  });

  it("calls createAdminClient (service_role), not the anon client", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null } as RpcResult);

    await findDuplicatesHandler({
      nombre: "Test",
      apellidos: "User",
      threshold: 0.7,
    });

    expect(createAdminClient).toHaveBeenCalledOnce();
  });

  it("calls rpc with correct parameter names", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null } as RpcResult);

    await findDuplicatesHandler({
      nombre: "Maria",
      apellidos: "Lopez",
      threshold: 0.8,
    });

    expect(rpcMock).toHaveBeenCalledWith("find_duplicate_persons", {
      p_nombre: "Maria",
      p_apellidos: "Lopez",
      p_threshold: 0.8,
    });
  });
});
