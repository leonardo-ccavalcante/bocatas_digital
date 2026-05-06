import { describe, it, expect } from "vitest";
import {
  buildQrPayload,
  parseQrPayload,
  verifySig,
} from "./payload";

const TEST_SECRET = "test-secret-do-not-use-in-prod-must-be-256-bit-or-better-aaaa";
const TEST_UUID = "12345678-1234-1234-1234-1234567890ab";

describe("qr/payload", () => {
  describe("buildQrPayload", () => {
    it("produces a canonical URI with bocatas://person/ prefix + uuid + sig", async () => {
      const payload = await buildQrPayload(TEST_UUID, TEST_SECRET);
      expect(payload).toMatch(
        /^bocatas:\/\/person\/[0-9a-f-]{36}\?sig=[a-f0-9]{8}$/
      );
      expect(payload).toContain(TEST_UUID);
    });

    it("produces a stable signature for the same uuid+secret", async () => {
      const a = await buildQrPayload(TEST_UUID, TEST_SECRET);
      const b = await buildQrPayload(TEST_UUID, TEST_SECRET);
      expect(a).toEqual(b);
    });

    it("produces different signatures for different uuids", async () => {
      const a = await buildQrPayload(TEST_UUID, TEST_SECRET);
      const b = await buildQrPayload(
        "00000000-0000-0000-0000-000000000000",
        TEST_SECRET
      );
      expect(a).not.toEqual(b);
    });

    it("produces different signatures for different secrets", async () => {
      const a = await buildQrPayload(TEST_UUID, TEST_SECRET);
      const b = await buildQrPayload(TEST_UUID, TEST_SECRET + "extra");
      expect(a).not.toEqual(b);
    });
  });

  describe("parseQrPayload", () => {
    it("parses a canonical URI", async () => {
      const payload = await buildQrPayload(TEST_UUID, TEST_SECRET);
      const parsed = parseQrPayload(payload);
      expect(parsed).not.toBeNull();
      expect(parsed!.uuid).toBe(TEST_UUID);
      expect(parsed!.sig).toMatch(/^[a-f0-9]{8}$/);
    });

    it("returns null for non-bocatas URIs", () => {
      expect(parseQrPayload("https://example.com/abc")).toBeNull();
      expect(parseQrPayload("foo")).toBeNull();
      expect(parseQrPayload("")).toBeNull();
    });

    it("returns null for bocatas URI without sig", () => {
      expect(parseQrPayload(`bocatas://person/${TEST_UUID}`)).toBeNull();
    });

    it("returns null for malformed uuid", () => {
      expect(
        parseQrPayload("bocatas://person/not-a-uuid?sig=abcd1234")
      ).toBeNull();
    });

    it("returns null for malformed sig (wrong length)", () => {
      expect(
        parseQrPayload(`bocatas://person/${TEST_UUID}?sig=abcd`)
      ).toBeNull();
    });

    it("returns null for malformed sig (non-hex chars)", () => {
      expect(
        parseQrPayload(`bocatas://person/${TEST_UUID}?sig=zzzzzzzz`)
      ).toBeNull();
    });
  });

  describe("verifySig", () => {
    it("returns true for a valid signature", async () => {
      const payload = await buildQrPayload(TEST_UUID, TEST_SECRET);
      const parsed = parseQrPayload(payload)!;
      expect(await verifySig(parsed.uuid, parsed.sig, TEST_SECRET)).toBe(true);
    });

    it("returns false for tampered uuid", async () => {
      const payload = await buildQrPayload(TEST_UUID, TEST_SECRET);
      const parsed = parseQrPayload(payload)!;
      const tamperedUuid = "00000000-0000-0000-0000-000000000000";
      expect(await verifySig(tamperedUuid, parsed.sig, TEST_SECRET)).toBe(false);
    });

    it("returns false for tampered sig", async () => {
      const payload = await buildQrPayload(TEST_UUID, TEST_SECRET);
      const parsed = parseQrPayload(payload)!;
      const tamperedSig = "deadbeef";
      expect(await verifySig(parsed.uuid, tamperedSig, TEST_SECRET)).toBe(false);
    });

    it("returns false with wrong secret", async () => {
      const payload = await buildQrPayload(TEST_UUID, TEST_SECRET);
      const parsed = parseQrPayload(payload)!;
      expect(await verifySig(parsed.uuid, parsed.sig, "wrong-secret-zzzzzz")).toBe(false);
    });
  });

  describe("RGPD-compliance — payload contains zero PII", () => {
    it("does not include any name/phone/document/email substring", async () => {
      const payload = await buildQrPayload(TEST_UUID, TEST_SECRET);
      // Negative-list assertions: payload must contain only the URI scheme,
      // bocatas, person, the uuid hex+dashes, ?sig=, and 8 hex chars.
      // No alpha letters except the ones allowed.
      const allowed = /^bocatas:\/\/person\/[0-9a-f-]{36}\?sig=[a-f0-9]{8}$/;
      expect(payload).toMatch(allowed);
    });
  });
});
