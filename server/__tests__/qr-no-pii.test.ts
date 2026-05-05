/**
 * qr-no-pii.test.ts — paired with audit-no-pii.test.ts (which covers audit logs).
 *
 * Locks in the QA-1A guarantee: QR-generation code paths must NEVER bake
 * person PII into the QR payload. The QR module must be a server-signed
 * URI of the form `bocatas://person/<uuid>?sig=<hmac8>` — UUID-only,
 * RGPD-compliant.
 *
 * Mechanism: source-level static check. We grep the QR-generation source
 * files for direct references to PII column names appearing as JSON
 * payload keys / object literal entries. False positives (e.g. the
 * on-screen header text rendering `person.nombre`) are excluded by the
 * regex (matches literal `: person.<col>` only inside a JSON payload
 * builder, not display).
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");

const QR_GENERATION_FILES = [
  "client/src/features/persons/components/QRCodeCard.tsx",
  "client/src/pages/MiQR.tsx",
];

const PII_COLUMN_NAMES = [
  "nombre",
  "apellidos",
  "telefono",
  "email",
  "numero_documento",
  "tipo_documento",
  "direccion",
  "fecha_nacimiento",
  "fecha_llegada_espana",
  "situacion_legal",
  "recorrido_migratorio",
  "foto_documento_url",
];

describe("QR generation must contain zero PII (CLAUDE.md guard-rail + Phase 6 F-001)", () => {
  for (const relPath of QR_GENERATION_FILES) {
    it(`${relPath}: no PII keys in QR.toCanvas/toDataURL payload`, () => {
      const fullPath = path.join(ROOT, relPath);
      const src = fs.readFileSync(fullPath, "utf-8");

      // Find the actual QR.toCanvas / QRCode.toCanvas call sites and
      // inspect the payload variable that's passed in.
      const toCanvasCalls = src.match(/QRCode\.toCanvas\([^,]+,\s*(\w+)/g) ?? [];
      expect(toCanvasCalls.length).toBeGreaterThan(0);

      // For each PII column name, ensure it does NOT appear as an object
      // literal key being assigned to `qrPayload` / `payload`.
      // Pattern catches: `qrPayload = JSON.stringify({ id, nombre, … })`
      //                  `qrPayload = JSON.stringify({ nombre: person.nombre })`
      // Allows: `<CardTitle>{person.nombre}</CardTitle>` (display, not encoding).
      const piiInPayload = new RegExp(
        `(qr[Pp]ayload|payload)\\s*=\\s*[^;]*\\b(${PII_COLUMN_NAMES.join("|")})\\b`,
        "g"
      );

      const matches = src.match(piiInPayload) ?? [];
      expect(
        matches,
        `QR payload in ${relPath} appears to contain PII column references: ${matches.join(", ")}`
      ).toEqual([]);
    });
  }

  it("shared/qr/payload.ts produces only the canonical PII-free URI", async () => {
    const { buildQrPayload } = await import("../../shared/qr/payload");
    const fakeUuid = "12345678-1234-1234-1234-1234567890ab";
    const fakeSecret = "test-secret-do-not-use-in-prod-must-be-256-bit-or-better-aaaa";
    const out = await buildQrPayload(fakeUuid, fakeSecret);
    // Canonical regex — same one parseQrPayload uses.
    expect(out).toMatch(
      /^bocatas:\/\/person\/[0-9a-f-]{36}\?sig=[a-f0-9]{8}$/
    );
    // Negative: literally no alphabet characters outside the allowed set
    // (b, o, c, a, t, s, p, e, r, n, h, d, f, g, i, l, m, q, u, w, x, y, z, etc.
    // — but the URI contains only the literal `bocatas://person/?sig=` plus
    // hex digits, so we test that indirectly by re-asserting the regex).
    expect(out).not.toContain("nombre");
    expect(out).not.toContain("apellido");
  });
});
