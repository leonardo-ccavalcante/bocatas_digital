/**
 * tipo_slug becomes part of the storage key (buildStoragePath:
 * `sessions/<id>/${tipoSlug}-<rand>.<ext>`). Without a charset guard a value
 * like `../../x` escapes the `sessions/<id>/` prefix and, with the upsert,
 * overwrites arbitrary objects in the bucket — reachable even from the PUBLIC
 * enlace endpoint (#169 / RC-63 / F081).
 */
import { describe, it, expect } from "vitest";
import { tipoSlugSchema, uploadInputSchema } from "../routers/programs.sessionDocuments";

describe("tipoSlug storage-key validation (#169)", () => {
  it.each(["../../x", "a/b", "a.b", "..", "acta/../x", "UPPER", "con espacio", "", "x".repeat(51)])(
    "rejects a traversal / non-slug value: %j",
    (bad) => {
      expect(tipoSlugSchema.safeParse(bad).success).toBe(false);
    }
  );

  it.each(["acta_firmada", "hoja_asistencia", "plan2026", "doc_1"])(
    "accepts a bare slug: %s",
    (ok) => {
      expect(tipoSlugSchema.safeParse(ok).success).toBe(true);
    }
  );

  // Endpoint boundary: both uploadSessionDocument and the PUBLIC
  // enlaceUploadSessionDocument feed input through uploadInputSchema, so the
  // guard is proven at the exact shape those endpoints validate.
  const validInput = {
    sessionId: "11111111-1111-1111-1111-111111111111",
    base64File: "AAAA",
    mimeType: "image/png",
    fileName: "doc.png",
  };

  it("uploadInputSchema (shared by both endpoints) rejects a traversal tipoSlug", () => {
    expect(uploadInputSchema.safeParse({ ...validInput, tipoSlug: "../../x" }).success).toBe(false);
  });

  it("uploadInputSchema accepts a valid tipoSlug", () => {
    expect(uploadInputSchema.safeParse({ ...validInput, tipoSlug: "acta_firmada" }).success).toBe(true);
  });
});
