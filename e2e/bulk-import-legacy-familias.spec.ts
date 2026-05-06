import { test, expect } from "@playwright/test";
import path from "path";

/**
 * JTBD (admin, e.g. Sole or Espe):
 *   "When I receive an updated family list from the legacy FAMILIAS Excel
 *    system, I want to import it into Bocatas Digital in one step, see what
 *    would change before committing, and have full traceability back to the
 *    source row, so that I can migrate without manual data entry and audit
 *    any decision later."
 *
 * Success criteria (legacy importer feature):
 *   - Drag-drop or file-pick CSV uploads cleanly
 *   - Preview shows the right family/row counts
 *   - Confirm creates families and persons in DB
 *   - Re-uploading the same CSV reports families as duplicate (idempotency)
 *
 * Gating: requires E2E_LIVE=1 with seeded admin user + applied migrations
 * (20260601000001/02/03). Skipped otherwise.
 */
const isLive = process.env.E2E_LIVE === "1";
const FIXTURE = path.join(
  __dirname,
  "..",
  "tests",
  "fixtures",
  "legacy-familias-prueba.csv",
);

test.describe("Bulk import legacy familias — JTBD", () => {
  test.skip(!isLive, "Set E2E_LIVE=1 with seeded admin user + applied migrations");

  test("admin imports the legacy CSV; re-import reports duplicates", async ({ page }) => {
    // 1. Login as admin
    await page.goto("/login");
    await page.getByLabel(/correo|email/i).fill("admin@bocatas.test");
    await page.getByLabel(/contrase[ñn]a|password/i).fill("BocatasAdmin2026!");
    await page.getByRole("button", { name: /entrar|login/i }).click();

    // 2. Navigate to /familias and open the legacy import modal
    await page.goto("/familias");
    await page.getByRole("button", { name: /Importar CSV legacy|Legacy/i }).click();
    await expect(
      page.getByRole("heading", { name: /Importar familias desde CSV legacy/i }),
    ).toBeVisible();

    // 3. Upload the fixture (drag-drop unsupported in pw API → use file input)
    const fileInput = page.locator("input[type=file]");
    await fileInput.setInputFiles(FIXTURE);

    // 4. Preview appears with the expected family count (5 in the prueba CSV)
    await expect(page.getByText(/5 familias/i)).toBeVisible({ timeout: 10_000 });
    // Confirm button enabled (no group-level errors expected on this fixture)
    await page
      .getByRole("button", { name: /Confirmar importaci[oó]n/i })
      .click();

    // 5. Toast confirms creation
    await expect(page.getByText(/5 familias importadas/i)).toBeVisible({
      timeout: 30_000,
    });

    // 6. Idempotency: re-import → all 5 reported as duplicates, 0 created.
    await page.getByRole("button", { name: /Importar CSV legacy|Legacy/i }).click();
    await fileInput.setInputFiles(FIXTURE);
    await expect(page.getByText(/5 ya importadas/i)).toBeVisible({ timeout: 10_000 });
    // The OK tab will be empty; switch to Duplicadas tab and confirm
    await page.getByRole("button", { name: /Duplicadas/i }).click();
    await expect(page.getByText(/#1030/)).toBeVisible();
    // Skip-only confirm
    await page
      .getByRole("button", { name: /Confirmar importaci[oó]n/i })
      .click();
    await expect(
      page.getByText(/0 familias importadas \(5 omitidas como duplicadas\)/i),
    ).toBeVisible({ timeout: 30_000 });
  });
});
