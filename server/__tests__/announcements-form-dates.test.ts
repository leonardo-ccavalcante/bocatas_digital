import { describe, it, expect } from "vitest";
import { FormSchema, toAnnouncementPayload } from "../../client/src/pages/AdminNovedades/_shared";
import { CreateAnnouncementSchema } from "../routers/announcements/_shared";

// Raw values exactly as react-hook-form yields them with untouched date inputs.
const RAW_FORM = {
  titulo: "Aviso de cierre",
  contenido: "El comedor cierra el lunes.",
  tipo: "info",
  es_urgente: false,
  fijado: false,
  fecha_fin: "",
  published_at: "",
  expires_at: "",
  audiences: [{ programs: ["comedor"], roles: ["beneficiario"] }],
};

describe("AdminNovedades FormSchema ↔ announcements.create (F001/F106/F228)", () => {
  it("accepts untouched date inputs ('') and normalises them to undefined", () => {
    const r = FormSchema.safeParse(RAW_FORM);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.fecha_fin).toBeUndefined();
      expect(r.data.published_at).toBeUndefined();
      expect(r.data.expires_at).toBeUndefined();
    }
  });

  it("server schema accepts the payload built from a blank-dates form", () => {
    const r = FormSchema.safeParse(RAW_FORM);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(CreateAnnouncementSchema.safeParse(toAnnouncementPayload(r.data)).success).toBe(true);
    }
  });

  it("converts a filled fecha_fin (YYYY-MM-DD) to the ISO datetime the server requires", () => {
    const r = FormSchema.safeParse({ ...RAW_FORM, fecha_fin: "2026-09-30", published_at: "2026-09-01", expires_at: "2026-09-30" });
    expect(r.success).toBe(true);
    if (r.success) {
      const payload = toAnnouncementPayload(r.data);
      expect(payload.fecha_fin).toBe("2026-09-30T00:00:00.000Z");
      expect(payload.published_at).toBe("2026-09-01");
      expect(CreateAnnouncementSchema.safeParse(payload).success).toBe(true);
    }
  });

  it("still rejects expires_at before published_at, anchored to expires_at", () => {
    const r = FormSchema.safeParse({ ...RAW_FORM, published_at: "2026-09-30", expires_at: "2026-09-01" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join(".") === "expires_at")).toBe(true);
    }
  });
});
