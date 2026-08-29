/**
 * programs.sessionDocuments.test.ts — RED-first contract tests for the
 * session document upload + lesson-plan OCR procedures.
 *
 * Covers:
 * - uploadSessionDocument creates a session_documents row (so fetchPresentUploadSlugs
 *   returns the slug → close validation passes)
 * - uploadSessionDocument rejects oversized base64 (> 8 MB) → BAD_REQUEST
 * - uploadSessionDocument rejects disallowed mime type → BAD_REQUEST
 * - getSessionDocuments returns rows for the session (authed, access-guarded)
 * - enlaceUploadSessionDocument with invalid token → FORBIDDEN
 * - enlaceUploadSessionDocument with valid token → inserts session_documents row
 * - enlaceUploadSessionDocument on cerrada session → FORBIDDEN
 * - extractLessonPlan: mocked invokeLLM → organized text
 * - extractLessonPlan: LLM error → graceful degradation (success:false, texto:"")
 * - enlaceExtractLessonPlan: invalid token → FORBIDDEN
 * - enlaceExtractLessonPlan: valid token → returns texto
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { initTRPC, TRPCError } from "@trpc/server";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import type { TrpcContext } from "../../_core/context";
import { Logger } from "../../_core/logger";
import { generateSessionToken, hashSessionToken } from "../../../shared/sessionEnlace";

vi.mock("../../_core/env", () => ({
  ENV: {
    qrSigningSecret: "test-qr-secret-minimum-32-chars-padded",
    sessionLinkSecret: "test-link-secret-minimum-32-chars-pad",
  },
}));

vi.mock("../../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(),
}));

const mockInvokeLLM = vi.fn();
vi.mock("../../_core/llm", () => ({ invokeLLM: mockInvokeLLM }));

const TEST_LINK_SECRET = "test-link-secret-minimum-32-chars-pad";

const t = initTRPC.context<TrpcContext>().create({
  transformer: { serialize: (v: unknown) => v, deserialize: (v: unknown) => v },
});

function buildCtx(role: "admin" | "voluntario" | null): TrpcContext {
  return {
    user: role
      ? {
          id: "test-user-1", openId: "test", name: "Test User", email: "t@t.com",
          role, loginMethod: "google",
          createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
        }
      : null,
    logger: new Logger(),
    correlationId: "test",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    req: {} as any, res: {} as any,
  };
}

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
type Row = Record<string, unknown>;

function mockDb(tables: Record<string, Row[]>) {
  const inserts: Record<string, Row[]> = {};
  const updates: Record<string, Row[]> = {};

  const makeChain = (table: string) => {
    const filters: Record<string, unknown> = {};
    const isNullCols: string[] = [];
    let insertPayload: Row | null = null;

    const rowsFor = () => {
      let rows = tables[table] ?? [];
      rows = rows.filter((r) =>
        Object.entries(filters).every(([k, v]) => !(k in r) || r[k] === v)
      );
      if (isNullCols.length) {
        rows = rows.filter((r) => isNullCols.every((c) => r[c] == null));
      }
      return rows;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {
      select: vi.fn(() => chain),
      order: vi.fn(() => chain),
      is: vi.fn((col: string, val: unknown) => { if (val === null) isNullCols.push(col); return chain; }),
      limit: vi.fn(() => chain),
      eq: vi.fn((col: string, val: unknown) => { filters[col] = val; return chain; }),
      in: vi.fn(() => chain),
      insert: vi.fn((payload: Row | Row[]) => {
        const row = Array.isArray(payload) ? payload[0] : payload;
        insertPayload = { id: "new-doc-id", version: 1, created_at: "2026-07-23T10:00:00Z", ...row };
        (inserts[table] ??= []).push(row);
        return chain;
      }),
      update: vi.fn((payload: Row) => { (updates[table] ??= []).push(payload); return chain; }),
      single: vi.fn(() => {
        if (insertPayload) {
          const r = insertPayload;
          insertPayload = null;
          return Promise.resolve({ data: r, error: null });
        }
        const row = rowsFor()[0] ?? null;
        return Promise.resolve({
          data: row,
          error: row ? null : { code: "PGRST116", message: "not found" },
        });
      }),
      maybeSingle: vi.fn(() =>
        Promise.resolve({ data: rowsFor()[0] ?? null, error: null })
      ),
    };
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: rowsFor(), error: null }).then(resolve);
    return chain;
  };

  const storageMock = {
    from: vi.fn((_bucket: string) => ({
      upload: vi.fn(() =>
        Promise.resolve({ data: { path: "sessions/test-sid/plan_clase-abc.pdf" }, error: null })
      ),
    })),
  };

  vi.mocked(createAdminClient).mockReturnValue({
    from: vi.fn((table: string) => makeChain(table)),
    storage: storageMock,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  return { inserts, updates, storageMock };
}

async function sessionWithToken(sessionId: string, programId: string, estado = "abierta") {
  const token = generateSessionToken();
  const hash = await hashSessionToken(token, TEST_LINK_SECRET);
  return {
    token,
    session: {
      id: sessionId, program_id: programId, fecha: "2026-07-23",
      location_id: ID(99), estado,
      enlace_token_hash: hash,
      enlace_expira: new Date(Date.now() + 3_600_000).toISOString(),
    },
  };
}

beforeEach(() => { vi.clearAllMocks(); mockInvokeLLM.mockReset(); });

// ─── uploadSessionDocument ────────────────────────────────────────────────────

describe("sessionDocumentsRouter.uploadSessionDocument", () => {
  it("inserts a session_documents row and returns it (happy path)", async () => {
    const { inserts } = mockDb({
      programs: [{ id: ID(2), volunteer_can_access: true }],
      program_sessions: [{ id: ID(1), program_id: ID(2) }],
      session_documents: [],
    });

    const { sessionDocumentsRouter } = await import("../programs.sessionDocuments");
    const caller = t.createCallerFactory(sessionDocumentsRouter)(buildCtx("admin"));

    const smallBase64 = Buffer.from("fake-pdf-content").toString("base64");
    const result = await caller.uploadSessionDocument({
      sessionId: ID(1),
      tipoSlug: "plan_clase",
      base64File: smallBase64,
      mimeType: "application/pdf",
      fileName: "plan.pdf",
    });

    expect(result.tipo_slug).toBe("plan_clase");
    expect(inserts["session_documents"]).toHaveLength(1);
    expect(inserts["session_documents"]![0]?.tipo_slug).toBe("plan_clase");
    expect(inserts["session_documents"]![0]?.session_id).toBe(ID(1));
  });

  it("rejects mimeType not in allowlist → BAD_REQUEST", async () => {
    mockDb({
      programs: [{ id: ID(2), volunteer_can_access: true }],
      program_sessions: [{ id: ID(1), program_id: ID(2) }],
      session_documents: [],
    });

    const { sessionDocumentsRouter } = await import("../programs.sessionDocuments");
    const caller = t.createCallerFactory(sessionDocumentsRouter)(buildCtx("admin"));

    await expect(
      caller.uploadSessionDocument({
        sessionId: ID(1),
        tipoSlug: "plan_clase",
        base64File: "aGVsbG8=",
        mimeType: "application/x-exe",
        fileName: "virus.exe",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects base64 that decodes to > 8 MB → BAD_REQUEST", async () => {
    mockDb({
      programs: [{ id: ID(2), volunteer_can_access: true }],
      program_sessions: [{ id: ID(1), program_id: ID(2) }],
      session_documents: [],
    });

    const { sessionDocumentsRouter } = await import("../programs.sessionDocuments");
    const caller = t.createCallerFactory(sessionDocumentsRouter)(buildCtx("admin"));
    const bigBase64 = Buffer.alloc(9 * 1024 * 1024).toString("base64");

    await expect(
      caller.uploadSessionDocument({
        sessionId: ID(1),
        tipoSlug: "plan_clase",
        base64File: bigBase64,
        mimeType: "application/pdf",
        fileName: "big.pdf",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects FORBIDDEN for voluntario on volunteer_can_access=false program", async () => {
    mockDb({
      programs: [{ id: ID(2), volunteer_can_access: false }],
      program_sessions: [{ id: ID(1), program_id: ID(2) }],
      session_documents: [],
    });

    const { sessionDocumentsRouter } = await import("../programs.sessionDocuments");
    const caller = t.createCallerFactory(sessionDocumentsRouter)(buildCtx("voluntario"));

    await expect(
      caller.uploadSessionDocument({
        sessionId: ID(1), tipoSlug: "plan_clase",
        base64File: "aGVsbG8=", mimeType: "application/pdf", fileName: "p.pdf",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ─── getSessionDocuments ──────────────────────────────────────────────────────

describe("sessionDocumentsRouter.getSessionDocuments", () => {
  it("returns existing session_documents rows", async () => {
    const docRow = {
      id: "doc-1", session_id: ID(1), tipo_slug: "plan_clase",
      url: "sessions/test/plan_clase-abc.pdf", version: 1,
      subido_por: "Admin User", en_nombre_de: null, created_at: "2026-07-23T10:00:00Z",
    };
    mockDb({
      programs: [{ id: ID(2), volunteer_can_access: true }],
      program_sessions: [{ id: ID(1), program_id: ID(2) }],
      session_documents: [docRow],
    });

    const { sessionDocumentsRouter } = await import("../programs.sessionDocuments");
    const caller = t.createCallerFactory(sessionDocumentsRouter)(buildCtx("admin"));

    const rows = await caller.getSessionDocuments({ sessionId: ID(1) });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tipo_slug).toBe("plan_clase");
  });
});

// ─── enlaceUploadSessionDocument ─────────────────────────────────────────────

describe("sessionDocumentsRouter.enlaceUploadSessionDocument", () => {
  it("rejects invalid token → FORBIDDEN", async () => {
    const { session } = await sessionWithToken(ID(1), ID(2));
    mockDb({
      programs: [{ id: ID(2), volunteer_can_access: true }],
      program_sessions: [session],
      session_documents: [],
    });

    const { sessionDocumentsRouter } = await import("../programs.sessionDocuments");
    const caller = t.createCallerFactory(sessionDocumentsRouter)(buildCtx(null));

    await expect(
      caller.enlaceUploadSessionDocument({
        sessionId: ID(1), token: "bad-token",
        tipoSlug: "plan_clase", base64File: "aGVsbG8=",
        mimeType: "application/pdf", fileName: "plan.pdf",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects upload on cerrada session → FORBIDDEN", async () => {
    const { token, session } = await sessionWithToken(ID(1), ID(2), "cerrada");
    mockDb({
      programs: [{ id: ID(2), volunteer_can_access: true }],
      program_sessions: [session],
      session_documents: [],
    });

    const { sessionDocumentsRouter } = await import("../programs.sessionDocuments");
    const caller = t.createCallerFactory(sessionDocumentsRouter)(buildCtx(null));

    await expect(
      caller.enlaceUploadSessionDocument({
        sessionId: ID(1), token,
        tipoSlug: "plan_clase", base64File: "aGVsbG8=",
        mimeType: "application/pdf", fileName: "plan.pdf",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("inserts session_documents row with valid token (happy path)", async () => {
    const { token, session } = await sessionWithToken(ID(1), ID(2));
    const { inserts } = mockDb({
      programs: [{ id: ID(2), volunteer_can_access: true }],
      program_sessions: [session],
      session_documents: [],
    });

    const { sessionDocumentsRouter } = await import("../programs.sessionDocuments");
    const caller = t.createCallerFactory(sessionDocumentsRouter)(buildCtx(null));

    const result = await caller.enlaceUploadSessionDocument({
      sessionId: ID(1), token,
      tipoSlug: "plan_clase", base64File: "aGVsbG8=",
      mimeType: "application/pdf", fileName: "plan.pdf",
      enNombreDe: "Profe García",
    });

    expect(result.tipo_slug).toBe("plan_clase");
    expect(inserts["session_documents"]).toHaveLength(1);
    expect(inserts["session_documents"]![0]?.subido_por).toContain("enlace");
  });

  it("rejects disallowed mime even with valid token → BAD_REQUEST", async () => {
    const { token, session } = await sessionWithToken(ID(1), ID(2));
    mockDb({
      programs: [{ id: ID(2), volunteer_can_access: true }],
      program_sessions: [session],
      session_documents: [],
    });

    const { sessionDocumentsRouter } = await import("../programs.sessionDocuments");
    const caller = t.createCallerFactory(sessionDocumentsRouter)(buildCtx(null));

    await expect(
      caller.enlaceUploadSessionDocument({
        sessionId: ID(1), token,
        tipoSlug: "plan_clase", base64File: "aGVsbG8=",
        mimeType: "application/x-sh", fileName: "evil.sh",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

// ─── extractLessonPlan ────────────────────────────────────────────────────────

describe("sessionDocumentsRouter.extractLessonPlan", () => {
  it("returns organized texto from mocked invokeLLM", async () => {
    mockDb({ programs: [], program_sessions: [], session_documents: [] });
    mockInvokeLLM.mockResolvedValue({
      choices: [{
        index: 0, finish_reason: "stop",
        message: {
          role: "assistant",
          content: "## Tema\nMatemáticas\n## Objetivos\nAprender a sumar",
        },
      }],
    });

    const { sessionDocumentsRouter } = await import("../programs.sessionDocuments");
    const caller = t.createCallerFactory(sessionDocumentsRouter)(buildCtx("admin"));

    const result = await caller.extractLessonPlan({
      base64Image: "aGVsbG8=",
      mimeType: "image/jpeg",
    });

    expect(result.success).toBe(true);
    expect(result.texto).toContain("Matemáticas");
  });

  it("returns success:false on LLM error (graceful degradation)", async () => {
    mockDb({ programs: [], program_sessions: [], session_documents: [] });
    mockInvokeLLM.mockRejectedValue(new Error("LLM unreachable"));

    const { sessionDocumentsRouter } = await import("../programs.sessionDocuments");
    const caller = t.createCallerFactory(sessionDocumentsRouter)(buildCtx("admin"));

    const result = await caller.extractLessonPlan({
      base64Image: "aGVsbG8=",
      mimeType: "image/jpeg",
    });

    expect(result.success).toBe(false);
    expect(result.texto).toBe("");
  });
});

// ─── enlaceExtractLessonPlan ──────────────────────────────────────────────────

describe("sessionDocumentsRouter.enlaceExtractLessonPlan", () => {
  it("rejects invalid token → FORBIDDEN", async () => {
    const { session } = await sessionWithToken(ID(1), ID(2));
    mockDb({
      programs: [{ id: ID(2), volunteer_can_access: true }],
      program_sessions: [session],
      session_documents: [],
    });

    const { sessionDocumentsRouter } = await import("../programs.sessionDocuments");
    const caller = t.createCallerFactory(sessionDocumentsRouter)(buildCtx(null));

    await expect(
      caller.enlaceExtractLessonPlan({
        sessionId: ID(1), token: "invalid-token",
        base64Image: "aGVsbG8=", mimeType: "image/jpeg",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns organized texto with valid token", async () => {
    const { token, session } = await sessionWithToken(ID(1), ID(2));
    mockDb({
      programs: [{ id: ID(2), volunteer_can_access: true }],
      program_sessions: [session],
      session_documents: [],
    });
    mockInvokeLLM.mockResolvedValue({
      choices: [{
        index: 0, finish_reason: "stop",
        message: { role: "assistant", content: "## Tema\nLectura comprensiva" },
      }],
    });

    const { sessionDocumentsRouter } = await import("../programs.sessionDocuments");
    const caller = t.createCallerFactory(sessionDocumentsRouter)(buildCtx(null));

    const result = await caller.enlaceExtractLessonPlan({
      sessionId: ID(1), token,
      base64Image: "aGVsbG8=", mimeType: "image/jpeg",
    });

    expect(result.success).toBe(true);
    expect(result.texto).toContain("Lectura");
  });
});

// ─── FIX 1 — mime allowlist reconciliation ────────────────────────────────────

describe("sessionDocumentsRouter — FIX 1: ALLOWED_MIMES reconciliation", () => {
  it("accepts text/plain (needed for OCR-save path) → must NOT throw", async () => {
    const { inserts } = mockDb({
      programs: [{ id: ID(2), volunteer_can_access: true }],
      program_sessions: [{ id: ID(1), program_id: ID(2) }],
      session_documents: [],
    });

    const { sessionDocumentsRouter } = await import("../programs.sessionDocuments");
    const caller = t.createCallerFactory(sessionDocumentsRouter)(buildCtx("admin"));

    const result = await caller.uploadSessionDocument({
      sessionId: ID(1),
      tipoSlug: "plan_clase",
      base64File: Buffer.from("plain text content").toString("base64"),
      mimeType: "text/plain",
      fileName: "plan.txt",
    });

    expect(result.tipo_slug).toBe("plan_clase");
    expect(inserts["session_documents"]).toHaveLength(1);
  });

  it("rejects text/html → BAD_REQUEST (XSS vector excluded from allowlist)", async () => {
    mockDb({
      programs: [{ id: ID(2), volunteer_can_access: true }],
      program_sessions: [{ id: ID(1), program_id: ID(2) }],
      session_documents: [],
    });

    const { sessionDocumentsRouter } = await import("../programs.sessionDocuments");
    const caller = t.createCallerFactory(sessionDocumentsRouter)(buildCtx("admin"));

    await expect(
      caller.uploadSessionDocument({
        sessionId: ID(1),
        tipoSlug: "plan_clase",
        base64File: Buffer.from("<script>alert(1)</script>").toString("base64"),
        mimeType: "text/html",
        fileName: "xss.html",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

// ─── FIX 2 — OCR endpoint image-size bound ────────────────────────────────────

describe("sessionDocumentsRouter — FIX 2: OCR base64Image size cap", () => {
  // ~1.5 MB decoded → base64 string ≈ 2 MB chars; use just over the limit.
  const OVERSIZED_B64 = "A".repeat(2_097_153);

  it("extractLessonPlan: oversized base64Image → BAD_REQUEST before LLM call", async () => {
    mockDb({ programs: [], program_sessions: [], session_documents: [] });

    const { sessionDocumentsRouter } = await import("../programs.sessionDocuments");
    const caller = t.createCallerFactory(sessionDocumentsRouter)(buildCtx("admin"));

    await expect(
      caller.extractLessonPlan({ base64Image: OVERSIZED_B64, mimeType: "image/jpeg" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mockInvokeLLM).not.toHaveBeenCalled();
  });

  it("enlaceExtractLessonPlan: oversized base64Image → BAD_REQUEST before LLM call", async () => {
    const { token, session } = await sessionWithToken(ID(1), ID(2));
    mockDb({
      programs: [{ id: ID(2), volunteer_can_access: true }],
      program_sessions: [session],
      session_documents: [],
    });

    const { sessionDocumentsRouter } = await import("../programs.sessionDocuments");
    const caller = t.createCallerFactory(sessionDocumentsRouter)(buildCtx(null));

    await expect(
      caller.enlaceExtractLessonPlan({
        sessionId: ID(1), token,
        base64Image: OVERSIZED_B64, mimeType: "image/jpeg",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mockInvokeLLM).not.toHaveBeenCalled();
  });
});

// ─── MYT-136A — per-token/session rate limit on the public OCR endpoint ─────
//
// enlaceExtractLessonPlan is a publicProcedure (token-gated) that calls a paid
// vision LLM. Today the only throttle is the Express-level 200 req/15min PER
// IP limiter (server/_core/index.ts) — that limiter never runs inside this
// resolver test (createCaller bypasses the HTTP/Express layer entirely), and
// even in production a link-holder can rotate IPs to bypass it. There is NO
// per-token/session counter anywhere in this resolver, so nothing here stops
// unbounded LLM-cost amplification by a single link-holder. gh issue #136 item 1.
describe("sessionDocumentsRouter — MYT-136A: per-token OCR rate limit", () => {
  it("throttles repeated enlaceExtractLessonPlan calls on the SAME token with TOO_MANY_REQUESTS", async () => {
    const { token, session } = await sessionWithToken(ID(1), ID(2));
    mockDb({
      programs: [{ id: ID(2), volunteer_can_access: true }],
      program_sessions: [session],
      session_documents: [],
    });
    mockInvokeLLM.mockResolvedValue({
      choices: [{
        index: 0, finish_reason: "stop",
        message: { role: "assistant", content: "## Tema\nOK" },
      }],
    });

    const { sessionDocumentsRouter } = await import("../programs.sessionDocuments");
    const caller = t.createCallerFactory(sessionDocumentsRouter)(buildCtx(null));

    // A legitimate teacher retakes a photo a handful of times at most; 50 rapid
    // same-token invocations is well beyond any reasonable per-session cap and
    // must be rejected before reaching the LLM call.
    const ATTEMPTS = 50;
    let tooManyRequestsSeen = false;
    for (let i = 0; i < ATTEMPTS; i++) {
      try {
        await caller.enlaceExtractLessonPlan({
          sessionId: ID(1), token,
          base64Image: "aGVsbG8=", mimeType: "image/jpeg",
        });
      } catch (err) {
        if (err instanceof TRPCError && err.code === "TOO_MANY_REQUESTS") {
          tooManyRequestsSeen = true;
          break;
        }
        throw err; // unexpected error shape — fail loudly, don't swallow
      }
    }

    expect(tooManyRequestsSeen).toBe(true);
    // Cost containment: the cap must stop calls BEFORE they reach the paid LLM,
    // not just report the error after already having paid for the call.
    expect(mockInvokeLLM.mock.calls.length).toBeLessThan(ATTEMPTS);
  });
});

// ─── MYT-136A follow-up — the rate-limit Map must not grow unboundedly ──────
//
// The original MYT-136A fix reset a matched entry's count/windowStart once its
// window elapsed, but never deleted the entry itself: every DISTINCT
// sessionId:token that ever called this endpoint left a permanent Map entry —
// an unbounded, process-lifetime structure. This is the same anti-pattern the
// SAME wave's MYT-136B follow-up (cd8020b) deliberately removed elsewhere,
// noting at the time it was "the only module-level, unbounded-lifetime cache
// in server/routers/". This test proves stale windows are now evicted (not
// merely reset) so the Map stays bounded by currently-active windows.
describe("sessionDocumentsRouter — MYT-136A follow-up: bounded rate-limit Map", () => {
  it("evicts expired per-token windows instead of retaining them forever", async () => {
    vi.useFakeTimers();
    try {
      const sessions = [];
      for (let i = 0; i < 5; i++) {
        sessions.push(await sessionWithToken(ID(20 + i), ID(2)));
      }
      mockDb({
        programs: [{ id: ID(2), volunteer_can_access: true }],
        program_sessions: sessions.map((s) => s.session),
        session_documents: [],
      });
      mockInvokeLLM.mockResolvedValue({
        choices: [{
          index: 0, finish_reason: "stop",
          message: { role: "assistant", content: "## Tema\nOK" },
        }],
      });

      const { sessionDocumentsRouter, __ocrEnlaceRateLimitMapSizeForTest } =
        await import("../programs.sessionDocuments");
      const caller = t.createCallerFactory(sessionDocumentsRouter)(buildCtx(null));

      // One call per distinct sessionId:token pair — each leaves a live entry.
      for (let i = 0; i < 5; i++) {
        await caller.enlaceExtractLessonPlan({
          sessionId: ID(20 + i), token: sessions[i].token,
          base64Image: "aGVsbG8=", mimeType: "image/jpeg",
        });
      }

      // Advance past the 15-minute window (but within the 1h token expiry
      // sessionWithToken sets), so all 5 entries above are now stale.
      vi.advanceTimersByTime(15 * 60 * 1000 + 1);

      // A single call from a brand-new 6th token triggers the prune pass.
      const sixth = await sessionWithToken(ID(30), ID(2));
      mockDb({
        programs: [{ id: ID(2), volunteer_can_access: true }],
        program_sessions: [...sessions.map((s) => s.session), sixth.session],
        session_documents: [],
      });
      await caller.enlaceExtractLessonPlan({
        sessionId: ID(30), token: sixth.token,
        base64Image: "aGVsbG8=", mimeType: "image/jpeg",
      });

      // If stale entries were merely reset (not evicted), the Map would still
      // hold one permanent entry per distinct token ever seen. The fix prunes
      // every expired window on each call, so only the still-live 6th entry
      // (and any entries from OTHER tests that are also still live, which
      // there are none of at this point) should remain.
      expect(__ocrEnlaceRateLimitMapSizeForTest()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ─── FIX 4 — Android octet-stream / empty mime fallback ──────────────────────

describe("sessionDocumentsRouter — FIX 4: server-side mime inference from filename", () => {
  it("empty mimeType + plan.pdf filename → infers application/pdf → upload succeeds", async () => {
    const { inserts } = mockDb({
      programs: [{ id: ID(2), volunteer_can_access: true }],
      program_sessions: [{ id: ID(1), program_id: ID(2) }],
      session_documents: [],
    });

    const { sessionDocumentsRouter } = await import("../programs.sessionDocuments");
    const caller = t.createCallerFactory(sessionDocumentsRouter)(buildCtx("admin"));

    const result = await caller.uploadSessionDocument({
      sessionId: ID(1),
      tipoSlug: "plan_clase",
      base64File: Buffer.from("pdf-bytes").toString("base64"),
      mimeType: "",          // Android content provider reported empty type
      fileName: "plan.pdf",  // filename carries the extension
    });

    expect(result.tipo_slug).toBe("plan_clase");
    expect(inserts["session_documents"]).toHaveLength(1);
  });

  it("application/octet-stream + doc.png filename → infers image/png → upload succeeds", async () => {
    const { inserts } = mockDb({
      programs: [{ id: ID(2), volunteer_can_access: true }],
      program_sessions: [{ id: ID(1), program_id: ID(2) }],
      session_documents: [],
    });

    const { sessionDocumentsRouter } = await import("../programs.sessionDocuments");
    const caller = t.createCallerFactory(sessionDocumentsRouter)(buildCtx("admin"));

    const result = await caller.uploadSessionDocument({
      sessionId: ID(1),
      tipoSlug: "plan_clase",
      base64File: Buffer.from("png-bytes").toString("base64"),
      mimeType: "application/octet-stream",
      fileName: "doc.png",
    });

    expect(result.tipo_slug).toBe("plan_clase");
    expect(inserts["session_documents"]).toHaveLength(1);
  });

  it("octet-stream with unrecognised extension → BAD_REQUEST (no fallback possible)", async () => {
    mockDb({
      programs: [{ id: ID(2), volunteer_can_access: true }],
      program_sessions: [{ id: ID(1), program_id: ID(2) }],
      session_documents: [],
    });

    const { sessionDocumentsRouter } = await import("../programs.sessionDocuments");
    const caller = t.createCallerFactory(sessionDocumentsRouter)(buildCtx("admin"));

    await expect(
      caller.uploadSessionDocument({
        sessionId: ID(1),
        tipoSlug: "plan_clase",
        base64File: Buffer.from("binary").toString("base64"),
        mimeType: "application/octet-stream",
        fileName: "payload.exe",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
