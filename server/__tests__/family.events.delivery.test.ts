/**
 * family.events.delivery.test.ts — Phase B.7.2
 *
 * Locks the v1 schema for the `family.delivery.recorded` webhook event.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  FamilyDeliveryRecordedSchema,
  FORBIDDEN_PII_FIELDS,
  type FamilyDeliveryRecordedEvent,
} from "../../shared/familyEvents";

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

const VALID_EVENT: FamilyDeliveryRecordedEvent = {
  event: "family.delivery.recorded",
  version: "v1",
  family_id: "550e8400-e29b-41d4-a716-446655440002",
  familia_numero: 44,
  delivery_id: "660e8400-e29b-41d4-a716-446655440003",
  fecha_entrega: "2026-05-06",
  kg_total: 12.5,
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

describe("family.delivery.recorded — v1 schema", () => {
  it("validates a well-formed payload", () => {
    const result = FamilyDeliveryRecordedSchema.safeParse(VALID_EVENT);
    expect(result.success).toBe(true);
  });

  it("rejects negative kg_total", () => {
    const result = FamilyDeliveryRecordedSchema.safeParse({
      ...VALID_EVENT,
      kg_total: -1,
    });
    expect(result.success).toBe(false);
  });

  it("locks version to 'v1'", () => {
    const result = FamilyDeliveryRecordedSchema.safeParse({
      ...VALID_EVENT,
      version: "v2",
    });
    expect(result.success).toBe(false);
  });

  it("does NOT include any forbidden PII field in the schema shape", () => {
    const shapeKeys = Object.keys(FamilyDeliveryRecordedSchema.shape);
    for (const forbidden of FORBIDDEN_PII_FIELDS) {
      expect(shapeKeys).not.toContain(forbidden);
    }
    // Specifically: recogido_por (a free-text name) MUST NOT be in the
    // payload — that field on `deliveries` can carry the recipient's name.
    expect(shapeKeys).not.toContain("recogido_por");
    // firma_url is a storage path — also excluded.
    expect(shapeKeys).not.toContain("firma_url");
  });
});

describe("emitFamilyEvent — family.delivery.recorded", () => {
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
    expect(insertSpy.mock.calls[0][0].event).toBe("family.delivery.recorded");
  });
});
