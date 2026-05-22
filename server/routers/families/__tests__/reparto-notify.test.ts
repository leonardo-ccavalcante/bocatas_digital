import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { notifyRepartoChange } from "../reparto-notify";

const evt = {
  type: "reparto.reschedule" as const,
  family_id: "fam-1",
  round_id: "round-1",
  assigned_day: "2026-06-03",
};

describe("notifyRepartoChange (T9)", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => { delete process.env.N8N_REPARTO_WEBHOOK_URL; });
  afterEach(() => { globalThis.fetch = realFetch; });

  it("is a no-op (no fetch) when the webhook URL is not configured", async () => {
    const spy = vi.fn();
    globalThis.fetch = spy as unknown as typeof fetch;
    await notifyRepartoChange(evt);
    expect(spy).not.toHaveBeenCalled();
  });

  it("POSTs IDs only (no PII) when configured", async () => {
    process.env.N8N_REPARTO_WEBHOOK_URL = "https://n8n.example/webhook/reparto";
    const spy = vi.fn().mockResolvedValue(new Response("ok"));
    globalThis.fetch = spy as unknown as typeof fetch;

    await notifyRepartoChange(evt);

    expect(spy).toHaveBeenCalledTimes(1);
    const [, init] = spy.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual(evt);
    // Payload carries only IDs + date — never name/phone/DNI.
    expect(JSON.stringify(body)).not.toMatch(/nombre|telefono|dni|apellido/i);
  });

  it("never throws when delivery fails", async () => {
    process.env.N8N_REPARTO_WEBHOOK_URL = "https://n8n.example/webhook/reparto";
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network")) as unknown as typeof fetch;
    await expect(notifyRepartoChange(evt)).resolves.toBeUndefined();
  });
});
