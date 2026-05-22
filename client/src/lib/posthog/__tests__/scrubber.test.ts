import { describe, expect, it } from "vitest";
import { beforeSend } from "../scrubber";

type Ev = { properties?: Record<string, unknown> } | null;

function scrub(properties: Record<string, unknown>): Record<string, unknown> {
  const out = beforeSend({ event: "x", properties } as never) as {
    properties: Record<string, unknown>;
  };
  return out.properties;
}

describe("beforeSend PII scrubber", () => {
  it("passes through null (drop signal) untouched", () => {
    expect(beforeSend(null as Ev as never)).toBeNull();
  });

  it("drops properties whose KEY names PII", () => {
    const p = scrub({
      email: "jane@example.com",
      telefono: "600123456",
      nombre: "Jane Doe",
      apellido: "Doe",
      dni: "12345678Z",
      method: "qr",
    });
    expect(p.email).toBeUndefined();
    expect(p.telefono).toBeUndefined();
    expect(p.nombre).toBeUndefined();
    expect(p.apellido).toBeUndefined();
    expect(p.dni).toBeUndefined();
    expect(p.method).toBe("qr"); // PII-free prop preserved
  });

  it("redacts PII patterns embedded in free-text string VALUES", () => {
    const p = scrub({
      note: "contact jane@example.com or 600 123 456",
      legal: "NIE X1234567L, DNI 12345678Z",
    });
    expect(p.note).not.toContain("jane@example.com");
    expect(p.note).not.toContain("600 123 456");
    expect(p.legal).not.toContain("X1234567L");
    expect(p.legal).not.toContain("12345678Z");
  });

  it("strips query strings and id path segments from $current_url", () => {
    const p = scrub({
      $current_url:
        "https://app.bocatas.org/persons/3f8a-uuid-9c2b/edit?token=secret&id=42",
      $pathname: "/familias/123456/miembros",
    });
    expect(p.$current_url).not.toContain("token=secret");
    expect(p.$current_url).not.toContain("3f8a-uuid-9c2b");
    expect(p.$pathname).not.toContain("123456");
  });

  it("keeps PII-free numeric/enum properties intact", () => {
    const p = scrub({ count: 7, method: "manual", type: "nie" });
    expect(p.count).toBe(7);
    expect(p.method).toBe("manual");
    expect(p.type).toBe("nie"); // doc-type label, not a DNI/NIE number
  });
});
