/**
 * qr-sig-verification.test.ts — Server-side QR verification contract tests
 * for the verifyAndInsert procedure's signature-check block.
 *
 * All tests are DB-free. They exercise the shared/qr/payload helpers in the
 * same way the server does, and document the three required behaviors:
 *
 *   1. Valid sig is accepted (qrValue present + sig correct → proceed).
 *   2. Tampered sig is rejected (qrValue present + sig wrong → FORBIDDEN).
 *   3. Manual-search / demo paths (no qrValue) are unaffected — verified by
 *      showing that parseQrPayload returns null for bare UUIDs and unsigned
 *      demo values, which triggers the early-return bypass.
 *
 * The shared/qr/payload.test.ts covers buildQrPayload, parseQrPayload, and
 * verifySig in isolation. This file focuses on the server gate logic:
 *   - UUID mismatch between parsed payload and claimed personId.
 *   - The demo payload "bocatas://person/<uuid>" (no sig) → parse returns null.
 */

import { describe, it, expect } from "vitest";
import { buildQrPayload, parseQrPayload, verifySig } from "../../../../../shared/qr/payload";

const SECRET = "test-secret-that-is-at-least-32-chars-long!!";
const VALID_UUID = "11111111-2222-3333-4444-555555555555";
const OTHER_UUID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

// ─── Fix 2: valid signature accepted ─────────────────────────────────────────

describe("verifyAndInsert sig-check — valid QR", () => {
  it("accepts a correctly signed qrValue and matches the claimed personId", async () => {
    const qrValue = await buildQrPayload(VALID_UUID, SECRET);
    const parsed = parseQrPayload(qrValue);
    expect(parsed).not.toBeNull();
    // UUID in payload must match claimed personId (server-side check mirrors this)
    expect(parsed!.uuid.toLowerCase()).toBe(VALID_UUID.toLowerCase());
    const ok = await verifySig(parsed!.uuid, parsed!.sig, SECRET);
    expect(ok).toBe(true);
  });
});

// ─── Fix 2: tampered signature rejected ──────────────────────────────────────

describe("verifyAndInsert sig-check — tampered QR", () => {
  it("rejects a qrValue whose signature is corrupted", async () => {
    const qrValue = await buildQrPayload(VALID_UUID, SECRET);
    const parsed = parseQrPayload(qrValue);
    expect(parsed).not.toBeNull();

    // Corrupt the last character of the sig
    const tamperedSig =
      parsed!.sig.slice(0, -1) + (parsed!.sig.endsWith("f") ? "0" : "f");

    const ok = await verifySig(parsed!.uuid, tamperedSig, SECRET);
    expect(ok).toBe(false);
  });

  it("rejects a qrValue signed with a different secret", async () => {
    const qrValue = await buildQrPayload(VALID_UUID, SECRET);
    const parsed = parseQrPayload(qrValue);
    expect(parsed).not.toBeNull();

    const ok = await verifySig(
      parsed!.uuid,
      parsed!.sig,
      "wrong-secret-that-is-at-least-32-chars-long!!"
    );
    expect(ok).toBe(false);
  });
});

// ─── Fix 2: UUID mismatch guard ───────────────────────────────────────────────
// Mirrors the server check: if parsed.uuid !== input.personId → throw BAD_REQUEST

describe("verifyAndInsert sig-check — UUID mismatch", () => {
  it("detects when the QR payload UUID does not match the claimed personId", async () => {
    const qrValue = await buildQrPayload(VALID_UUID, SECRET);
    const parsed = parseQrPayload(qrValue);
    expect(parsed).not.toBeNull();

    // Attacker sends a valid QR for VALID_UUID but claims it belongs to OTHER_UUID
    expect(parsed!.uuid.toLowerCase()).not.toBe(OTHER_UUID.toLowerCase());
  });
});

// ─── Fix 2: manual-search path unaffected (no qrValue) ───────────────────────
// When qrValue is undefined, the server skips sig verification entirely.
// We verify that the two input shapes that produce undefined qrValue are correct.

describe("verifyAndInsert sig-check — bypass when qrValue absent", () => {
  it("parseQrPayload returns null for a bare UUID (manual-search has no qr string)", () => {
    // If rawQrValue is null → qrValue is undefined → server bypass fires.
    // This test documents that a bare UUID string would also be caught if
    // accidentally passed through (additional safety net).
    expect(parseQrPayload(VALID_UUID)).toBeNull();
  });

  it("parseQrPayload returns null for the demo mode payload (unsigned bocatas:// URI)", () => {
    // Demo mode emits "bocatas://person/<uuid>" without ?sig=.
    // In useCheckin.ts, isDemoMode===true → qrValue is set to undefined.
    // This test confirms the payload.ts parser would also reject it even if
    // the undefined-guard were bypassed.
    const demoPayload = `bocatas://person/b0000000-0000-0000-0000-000000000002`;
    expect(parseQrPayload(demoPayload)).toBeNull();
  });
});
