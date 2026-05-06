import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * JTBD (Espe, admin):
 *   "When the monthly Banco de Alimentos cycle closes, I want to export the
 *    GUF CSV that matches Banco's expected schema so that subsidies are paid
 *    on time without manual reconciliation."
 *
 * Success criterion (Phase B.8.4):
 *   - Triggering export from the families admin UI downloads a CSV
 *   - Header row matches the canonical GUF reference schema
 *     (tests/fixtures/guf-reference.csv from B.3)
 *
 * Gating: requires E2E_LIVE=1 (live Supabase + seeded admin + seeded families).
 *
 * Note on the fixture (per B.3 fixture header comment): the reference is
 * GENERATED FROM CURRENT EXPORTER and not yet validated against Espe/Sole's
 * canonical Banco template. Once they confirm the canonical column order,
 * regenerate guf-reference.csv and this spec will pin the contract.
 */

const isLive = process.env.E2E_LIVE === "1";

const GUF_FIXTURE_PATH = resolve(
  __dirname,
  "..",
  "tests",
  "fixtures",
  "guf-reference.csv",
);

function readReferenceHeader(): string {
  const raw = readFileSync(GUF_FIXTURE_PATH, "utf-8");
  // Skip the leading "# GENERATED ..." comment line if present.
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const headerLine = lines.find((line) => !line.startsWith("#"));
  if (!headerLine) {
    throw new Error("GUF reference fixture has no header row");
  }
  return headerLine;
}

test.describe("Family GUF CSV export (Espe) — monthly Banco de Alimentos", () => {
  test.skip(!isLive, "Set E2E_LIVE=1 with seeded admin + families to run");

  test("admin downloads GUF CSV whose header matches the reference", async ({
    page,
  }) => {
    const referenceHeader = readReferenceHeader();
    const referenceColumns = referenceHeader.split(",").map((c) => c.trim());

    // 1. Espe (admin) authenticates
    await page.goto("/login");
    await page.getByLabel(/correo|email/i).fill("espe@bocatas.test");
    await page.getByLabel(/contrase[ñn]a|password/i).fill("test-password");
    await page.getByRole("button", { name: /entrar|login/i }).click();

    // 2. Open families list and trigger export modal
    await page.goto("/familias");
    await page.getByRole("button", { name: /exportar|export/i }).click();

    // 3. Pick "with members" mode (matches the reference fixture shape)
    await page
      .getByRole("radio", { name: /con miembros|with members/i })
      .check();

    // 4. Trigger download
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /descargar|download/i }).click();
    const download = await downloadPromise;

    // 5. Persist and read the downloaded file
    const downloadPath = await download.path();
    expect(downloadPath, "download path must exist").not.toBeNull();
    if (!downloadPath) return; // type guard for the next read
    const downloaded = readFileSync(downloadPath, "utf-8");

    const downloadedLines = downloaded
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0);
    const downloadedHeader = downloadedLines.find((line) => !line.startsWith("#"));
    expect(downloadedHeader, "downloaded CSV must have a header row").toBeTruthy();
    if (!downloadedHeader) return;
    const downloadedColumns = downloadedHeader.split(",").map((c) => c.trim());

    // 6. Header contract: columns must match reference, in order.
    expect(downloadedColumns).toEqual(referenceColumns);

    // 7. At least one data row beyond the header
    expect(downloadedLines.length).toBeGreaterThan(1);
  });
});
