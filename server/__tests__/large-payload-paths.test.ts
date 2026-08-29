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
 * This asserts the list stays in sync with the routers that accept image bytes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const indexSrc = readFileSync(resolve(__dirname, "../_core/index.ts"), "utf8");

const allowlist = (() => {
  const block = indexSrc.match(/LARGE_PAYLOAD_PATHS\s*=\s*\[([\s\S]*?)\]/);
  if (!block) throw new Error("LARGE_PAYLOAD_PATHS not found in server/_core/index.ts");
  return [...block[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
})();

// Every tRPC procedure that accepts base64 image bytes in its input.
const UPLOAD_PROCEDURES = [
  { path: "/api/trpc/ocr", why: "document OCR — base64Image" },
  { path: "/api/trpc/persons.uploadPhoto", why: "profile + consent photo — base64" },
  { path: "/api/trpc/entregas.uploadPhotoToStorage", why: "delivery sheet photo — photoData base64" },
  { path: "/api/trpc/announcements.uploadImage", why: "novedad image" },
  { path: "/api/trpc/programs.sessionDocuments.uploadSessionDocument", why: "session document — base64File, validated to 8 MB" },
  { path: "/api/trpc/families.uploadFamilyDocument", why: "family document — base64 PDF/JPG, validated to 10 MB" },
  { path: "/api/trpc/families.attachSignedActa", why: "signed Hoja de Firmas photo — base64" },
];

describe("LARGE_PAYLOAD_PATHS covers every upload procedure", () => {
  it.each(UPLOAD_PROCEDURES)("allowlists $path ($why)", ({ path }) => {
    expect(
      allowlist.some(p => path === p || path.startsWith(p)),
      `${path} is not in LARGE_PAYLOAD_PATHS (server/_core/index.ts), so a photo ` +
        `upload larger than 1 MB is rejected with HTTP 413 before the resolver runs.`
    ).toBe(true);
  });
});
