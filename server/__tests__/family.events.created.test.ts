/**
 * family.events.created.test.ts — Phase B.7.2
 *
 * Locks the v1 schema for the `family.created` webhook event:
 *   - A well-formed payload validates
 *   - Forbidden PII fields are rejected at parse time (RGPD)
 *   - Webhook URL is resolved from `app_settings.webhook_url`
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  FamilyCreatedSchema,
  FORBIDDEN_PII_FIELDS,
  type FamilyCreatedEvent,
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

// Import AFTER vi.mock so the mock is wired up
import { emitFamilyEvent } from "../familyEvents";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_EVENT: FamilyCreatedEvent = {
  event: "family.created",
  version: "v1",
  family_id: "550e8400-e29b-41d4-a716-446655440000",
  familia_numero: 42,
  num_adultos: 2,
  num_menores_18: 3,
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

// ─── Schema tests ─────────────────────────────────────────────────────────────

describe("family.created — v1 schema", () => {
  it("validates a well-formed payload", () => {
    const result = FamilyCreatedSchema.safeParse(VALID_EVENT);
    expect(result.success).toBe(true);
  });

  it("locks event discriminator to 'family.created'", () => {
    const result = FamilyCreatedSchema.safeParse({
      ...VALID_EVENT,
      event: "family.deactivated",
    });
    expect(result.success).toBe(false);
  });

  it("locks version to 'v1'", () => {
    const result = FamilyCreatedSchema.safeParse({
      ...VALID_EVENT,
      version: "v2",
    });
    expect(result.success).toBe(false);
  });

  it("rejects malformed family_id (not a UUID)", () => {
    const result = FamilyCreatedSchema.safeParse({
      ...VALID_EVENT,
      family_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("does NOT include any forbidden PII field in the schema shape", () => {
    const shapeKeys = Object.keys(FamilyCreatedSchema.shape);
    for (const forbidden of FORBIDDEN_PII_FIELDS) {
      expect(shapeKeys).not.toContain(forbidden);
    }
  });
});

// ─── Webhook URL resolution test ──────────────────────────────────────────────

describe("emitFamilyEvent — family.created", () => {
  it("resolves the webhook URL from app_settings.webhook_url and POSTs to it", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      text: () => Promise.resolve(""),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await emitFamilyEvent(VALID_EVENT);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://hook.example.com/family");
    expect(insertSpy).toHaveBeenCalledTimes(1);
    const row = insertSpy.mock.calls[0][0];
    expect(row.event).toBe("family.created");
    expect(row.family_id).toBe(VALID_EVENT.family_id);
  });

  it("logs 'no webhook configured' when app_settings.webhook_url is absent", async () => {
    appSettingsResult.data = null;
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await emitFamilyEvent(VALID_EVENT);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(insertSpy.mock.calls[0][0].error).toBe("no webhook configured");
  });
});
