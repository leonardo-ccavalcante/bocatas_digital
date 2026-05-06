/**
 * family.events.deactivated.test.ts — Phase B.7.2
 *
 * Locks the v1 schema for the `family.deactivated` webhook event.
 * `motivo_baja` (free text) is intentionally NOT in the payload — only the
 * coarse `motivo_categoria` enum, to avoid leaking PII a volunteer might
 * have typed into the free-text reason.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  FamilyDeactivatedSchema,
  FORBIDDEN_PII_FIELDS,
  type FamilyDeactivatedEvent,
} from "../../shared/familyEvents";

// ─── Mock Supabase admin client ───────────────────────────────────────────────

interface AppSettingRow {
  value: string;
}

const appSettingsResult: { data: AppSettingRow | null } = { data: null };
const insertSpy =
  vi.fn<(row: Record<string, unknown>) => Promise<{ error: null }>>();

vi.mock("../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "app_settings") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve(appSettingsResult),
            }),
          }),
        };
      }
      return {
        insert: (row: Record<string, unknown>) => {
          insertSpy(row);
          return Promise.resolve({ error: null });
        },
      };
    }),
  })),
}));

import { emitFamilyEvent } from "../familyEvents";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_EVENT: FamilyDeactivatedEvent = {
  event: "family.deactivated",
  version: "v1",
  family_id: "550e8400-e29b-41d4-a716-446655440001",
  familia_numero: 43,
  motivo_categoria: "voluntaria",
  fecha_baja: "2026-05-06",
  occurred_at: "2026-05-06T12:00:00.000Z",
};

const ORIGINAL_FETCH = globalThis.fetch;

beforeEach(() => {
  insertSpy.mockClear();
  appSettingsResult.data = { value: "https://hook.example.com/family" };
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

describe("family.deactivated — v1 schema", () => {
  it("validates a well-formed payload", () => {
    const result = FamilyDeactivatedSchema.safeParse(VALID_EVENT);
    expect(result.success).toBe(true);
  });

  it("locks event discriminator", () => {
    const result = FamilyDeactivatedSchema.safeParse({
      ...VALID_EVENT,
      event: "family.created",
    });
    expect(result.success).toBe(false);
  });

  it("locks version to 'v1'", () => {
    const result = FamilyDeactivatedSchema.safeParse({
      ...VALID_EVENT,
      version: "v2",
    });
    expect(result.success).toBe(false);
  });

  it("rejects motivo_categoria outside the closed enum", () => {
    const result = FamilyDeactivatedSchema.safeParse({
      ...VALID_EVENT,
      motivo_categoria: "free-text-reason",
    });
    expect(result.success).toBe(false);
  });

  it("does NOT include any forbidden PII field in the schema shape", () => {
    const shapeKeys = Object.keys(FamilyDeactivatedSchema.shape);
    for (const forbidden of FORBIDDEN_PII_FIELDS) {
      expect(shapeKeys).not.toContain(forbidden);
    }
  });
});

describe("emitFamilyEvent — family.deactivated", () => {
  it("resolves the webhook URL from app_settings.webhook_url", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      text: () => Promise.resolve(""),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await emitFamilyEvent(VALID_EVENT);

    expect(fetchMock.mock.calls[0][0]).toBe("https://hook.example.com/family");
    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(insertSpy.mock.calls[0][0].event).toBe("family.deactivated");
  });
});
