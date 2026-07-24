// MYTHOS: MYT-129C
//
// Finding: dataUrlToImageBuffer()/sniffImage() are duplicated across
// server/routers/families/rounds-signature.ts, server/routers/entregas/signature.ts
// and server/routers/derivar/intervenciones-uploads.ts (issue #129). Fix hint:
// extract a shared module with both functions.
//
// Verified in HEAD before writing this test (grep across server/ + shared/):
//   - A named `dataUrlToImageBuffer` function/export does NOT exist anywhere in
//     the repo today (0 matches). The finding's name is the TARGET shape for
//     the new module, not a literal pre-existing duplicate.
//   - A named `sniffImage` function exists ONLY in rounds-signature.ts:23-27
//     (single occurrence, not literally duplicated 3x under that name). The
//     other two routers re-implement equivalent-but-DIFFERENT-shaped byte
//     checks inline: intervenciones-uploads.ts:196-197 uses boolean
//     isPng/isJpeg locals (and a separate %PDF check for a different upload),
//     entregas/signature.ts has NO magic-byte check at all before upload.
//   - The genuinely duplicated logic (verified identical) is the
//     "strip data:image/*;base64, prefix, then Buffer.from(base64)" pattern,
//     present verbatim in rounds-signature.ts:65-66 and entregas/signature.ts:68-72.
//
// This test defines the contract for the new shared module using the ONE
// real existing implementation (rounds-signature.ts) as the behavioral
// reference, per the fix_hint's "comportamiento idéntico" requirement — it
// does not invent new validation behavior beyond what already exists in HEAD.
//
// Target path per the finding's `file` field: shared/imageIngest.ts. The
// fix_hint explicitly leaves shared/ vs server/_core/ to the fixer's
// judgement (Buffer is a Node API; shared/ is bundled client-side via the
// `@shared` Vite alias — see vite.config.ts:235). If the fixer relocates the
// module to server/_core/imageIngest.ts, this import path must move with it.
import { describe, expect, it } from "vitest";
import { dataUrlToImageBuffer, sniffImage } from "../imageIngest";

describe("shared/imageIngest — MYT-129C dedup target", () => {
  describe("sniffImage", () => {
    // Mirrors rounds-signature.ts:23-27 exactly (the only real named
    // implementation in HEAD).
    it('returns "png" for PNG magic bytes', () => {
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(sniffImage(png)).toBe("png");
    });

    it('returns "jpeg" for JPEG magic bytes', () => {
      const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
      expect(sniffImage(jpeg)).toBe("jpeg");
    });

    it("returns null for bytes that are neither png nor jpeg", () => {
      expect(sniffImage(Buffer.from("plain text", "utf-8"))).toBeNull();
    });

    it("returns null for a buffer shorter than any magic-byte sequence", () => {
      expect(sniffImage(Buffer.from([0x89]))).toBeNull();
    });
  });

  describe("dataUrlToImageBuffer", () => {
    // Mirrors the identical regex + Buffer.from pattern duplicated verbatim
    // in rounds-signature.ts:65-66 and entregas/signature.ts:68-72:
    //   input.replace(/^data:image\/\w+;base64,/, "") -> Buffer.from(..., "base64")
    it("strips a data:image/png;base64, prefix and decodes the payload", () => {
      const raw = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x01, 0x02, 0x03]);
      const dataUrl = `data:image/png;base64,${raw.toString("base64")}`;
      const decoded = dataUrlToImageBuffer(dataUrl);
      expect(Buffer.compare(decoded, raw)).toBe(0);
    });

    it("strips a data:image/jpeg;base64, prefix and decodes the payload", () => {
      const raw = Buffer.from([0xff, 0xd8, 0xff, 0x11, 0x22]);
      const dataUrl = `data:image/jpeg;base64,${raw.toString("base64")}`;
      const decoded = dataUrlToImageBuffer(dataUrl);
      expect(Buffer.compare(decoded, raw)).toBe(0);
    });
  });
});
