// MYTHOS: MYT-135A
//
// OCRResultSchema.data fields are typed `.optional()` (string|undefined), but
// server/routers/ocr.ts instructs the LLM to emit `null` per-field when a field
// is illegible/absent (see the `type: ["string", "null"]` JSON schema + the
// system prompt "use null for missing" in ocr.ts). A single `null` field makes
// the WHOLE `data` object fail Zod validation (`.optional()` rejects `null`),
// so ocr.ts:163-171 discards every successfully-extracted field and returns
// `{ success: false, data: {} }` — DocumentCaptureInline.tsx then autocompletes
// NOTHING, even though 6/7 fields were read correctly.
//
// Common real trigger: worn/foreign documents on low-end Android (primary
// device) where the LLM can read name/DOB/document number but not the country
// code, and legitimately emits `pais_documento: null`.
import { describe, it, expect } from "vitest";
import { OCRResultSchema } from "../related";

describe("OCRResultSchema — MYT-135A null-field tolerance", () => {
  it("does NOT let one null field invalidate the other 6 successfully-extracted fields", () => {
    // Exactly the evidence scenario from the finding: 6 valid string fields +
    // pais_documento: null (LLM legitimately can't read the document country).
    const llmLikeResponse = {
      success: true,
      data: {
        nombre: "Fatima",
        apellidos: "El Amrani",
        fecha_nacimiento: "1990-05-12",
        tipo_documento: "documento_extranjero",
        numero_documento: "AB123456",
        pais_origen: "MA",
        pais_documento: null, // LLM could not read the document's country
      },
    };

    const result = OCRResultSchema.safeParse(llmLikeResponse);

    // RED (current behavior): `pais_documento: z.string().length(2).optional()`
    // rejects `null` outright, so `success` is false here and every other
    // extracted field is lost downstream (ocr.ts returns `{ success:false,
    // data:{} }`). GREEN (post-fix): the schema should tolerate a null field
    // (e.g. `.nullish()`) and keep the 6 good fields.
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.data.nombre).toBe("Fatima");
      expect(result.data.data.apellidos).toBe("El Amrani");
      expect(result.data.data.numero_documento).toBe("AB123456");
      expect(result.data.data.pais_origen).toBe("MA");
    }
  });

  it("does NOT let a non-canonical genero from the LLM invalidate the 6 good fields", () => {
    // ocr.ts:93 sends `strict:false`, so the API does not enforce the genero
    // enum: the LLM can legitimately return a title-cased or English value
    // ('Masculino', 'male') that is NOT one of the DB enum members. A strict
    // `GeneroSchema.nullish()` would reject it and fail the WHOLE `data` parse —
    // reintroducing the MYT-135A bug through the added `genero` key. `.catch(
    // undefined)` must coerce the off-enum value to undefined and keep the rest.
    const llmLikeResponse = {
      success: true,
      data: {
        nombre: "Fatima",
        apellidos: "El Amrani",
        fecha_nacimiento: "1990-05-12",
        tipo_documento: "documento_extranjero",
        numero_documento: "AB123456",
        pais_origen: "MA",
        pais_documento: "MA",
        genero: "Masculino", // off-enum casing the LLM may emit
      },
    };

    const result = OCRResultSchema.safeParse(llmLikeResponse);

    expect(result.success).toBe(true);
    if (result.success) {
      // The off-enum genero is dropped to undefined (not set)…
      expect(result.data.data.genero).toBeUndefined();
      // …while every correctly-extracted field survives.
      expect(result.data.data.nombre).toBe("Fatima");
      expect(result.data.data.apellidos).toBe("El Amrani");
      expect(result.data.data.numero_documento).toBe("AB123456");
      expect(result.data.data.pais_origen).toBe("MA");
      expect(result.data.data.pais_documento).toBe("MA");
    }
  });
});
