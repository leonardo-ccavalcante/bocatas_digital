/**
 * large-payload-paths.test.ts
 *
 * server/_core/index.ts caps request bodies at 1 MB except for an explicit
 * allowlist. A base64 photo is ~1.33x its decoded size, so ANY upload procedure
 * missing from that list is rejected with HTTP 413 *before* Zod or the resolver
 * runs — a failure that looks like a broken feature, not a config gap. That is
 * how entregas.uploadPhotoToStorage and announcements.uploadImage were silently
 * unusable alongside the dead Manus storage backend.
 *
 * Este test comprueba la MISMA función que usa el servidor
 * (`isLargePayloadPath`). Antes traía su propio matcher, más laxo
 * (`path.startsWith(p)`), y por eso daba verde mientras `/api/trpc/ocr` no
 * casaba en producción con `/api/trpc/ocr.extractDocument`.
 */
import { describe, it, expect } from "vitest";
import { isLargePayloadPath } from "../_core/largePayloadPaths";

// Rutas tRPC REALES: router + "." + procedimiento, tal y como las emite
// httpBatchLink (client/src/lib/trpc.ts, client/src/main.tsx).
const UPLOAD_PROCEDURES = [
  { path: "/api/trpc/ocr.extractDocument", why: "document OCR — base64Image" },
  { path: "/api/trpc/persons.uploadPhoto", why: "profile + consent photo — base64" },
  { path: "/api/trpc/entregas.uploadPhotoToStorage", why: "delivery sheet photo — photoData base64" },
  { path: "/api/trpc/announcements.uploadImage", why: "novedad image" },
  { path: "/api/trpc/programs.sessionDocuments.uploadSessionDocument", why: "session document — base64File, validated to 8 MB" },
  { path: "/api/trpc/families.previewLegacyImport", why: "legacy CSV import preview" },
  { path: "/api/trpc/families.confirmLegacyImport", why: "legacy CSV import confirm" },
];

describe("LARGE_PAYLOAD_PATHS covers every upload procedure", () => {
  it.each(UPLOAD_PROCEDURES)("allowlists $path ($why)", ({ path }) => {
    expect(
      isLargePayloadPath(path),
      `${path} is not in LARGE_PAYLOAD_PATHS (server/_core/largePayloadPaths.ts), so a photo ` +
        `upload larger than 1 MB is rejected with HTTP 413 before the resolver runs.`
    ).toBe(true);
  });

  it("acepta el sufijo ?batch=1 que añade httpBatchLink", () => {
    expect(isLargePayloadPath("/api/trpc/ocr.extractDocument?batch=1")).toBe(true);
  });

  it("no ensancha el límite para rutas ajenas", () => {
    expect(isLargePayloadPath("/api/trpc/persons.getAll")).toBe(false);
    expect(isLargePayloadPath("/api/trpc/ocrusurpador.extract")).toBe(false);
  });
});
