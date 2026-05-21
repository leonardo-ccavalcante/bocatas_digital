import { test, expect } from "@playwright/test";

/**
 * JTBD (Admin / Trabajador social):
 *   "When I need the informe social for a family, I want to generate it in one
 *    click — but only when the seguimiento is current, so I never hand in a
 *    document with a stale effective date."
 *
 * Covers E1 freshness gate:
 *   - Fresh follow-up (< 365 days) → "Generar informe social" is ENABLED and a
 *     click triggers a .docx download.
 *   - Stale follow-up (> 365 days) or none → button DISABLED + inline blocking
 *     error (role="alert") visible without interaction.
 *
 * Gating: requires E2E_LIVE=1 plus a seeded environment:
 *   - an active `document_templates` row for slug 'informe_social' with its base
 *     .docx in the `document-templates` Storage bucket (E1 plan §H assumption #5),
 *   - E2E_FRESH_FAMILY_ID  → a family with a follow-up dated < 365 days ago,
 *   - E2E_STALE_FAMILY_ID  → a family whose newest follow-up is > 365 days ago,
 *   - a seeded admin auth session.
 * Skipped otherwise — per Karpathy guidance we write the spec end-to-end but do
 * NOT pretend it passes against an empty/unseeded environment.
 */

const isLive = process.env.E2E_LIVE === "1";
const FRESH_FAMILY_ID = process.env.E2E_FRESH_FAMILY_ID ?? "";
const STALE_FAMILY_ID = process.env.E2E_STALE_FAMILY_ID ?? "";

test.describe("Document generation — informe social freshness gate", () => {
  test.skip(
    !isLive || !FRESH_FAMILY_ID || !STALE_FAMILY_ID,
    "Set E2E_LIVE=1 + E2E_FRESH_FAMILY_ID + E2E_STALE_FAMILY_ID with a seeded informe_social template to run",
  );

  test.beforeEach(async ({ page }) => {
    // Seeded admin login (matches the other family E2E specs' auth flow).
    await page.goto("/login");
    await page.getByLabel(/correo|email/i).fill("admin@bocatas.test");
    await page.getByLabel(/contrase[ñn]a|password/i).fill("test-password");
    await page.getByRole("button", { name: /entrar|login/i }).click();
  });

  test("fresh informe: generate button enabled, click triggers .docx download", async ({
    page,
  }) => {
    await page.goto(`/programas/programa_familias/familias/${FRESH_FAMILY_ID}`);
    await page.getByRole("tab", { name: /documentos/i }).click();

    const generateBtn = page.getByRole("button", { name: /generar informe social/i });
    await expect(generateBtn).toBeEnabled();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      generateBtn.click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/informe-social-.*\.docx$/);
  });

  test("stale informe: generate button disabled with blocking error", async ({ page }) => {
    await page.goto(`/programas/programa_familias/familias/${STALE_FAMILY_ID}`);
    await page.getByRole("tab", { name: /documentos/i }).click();

    const generateBtn = page.getByRole("button", { name: /generar informe social/i });
    await expect(generateBtn).toBeDisabled();
    await expect(page.getByRole("alert")).toContainText(/vencido|sin seguimientos/i);
  });
});
