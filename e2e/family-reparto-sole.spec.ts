import { test, expect } from "@playwright/test";

/**
 * JTBD (Sole, admin/coordinator):
 *   "When I run the monthly food delivery, I want the app to split families
 *    across the reparto days and print the Hoja de Firmas, so I stop editing
 *    Excel and hand-writing the signing sheet."
 *
 * Success criterion (E5 Reparto):
 *   - Create a reparto from the Familias → Repartos tab
 *   - It appears in the reparto list in 'borrador'
 *   - The balanced day-split preview renders
 *
 * Gating: requires E2E_LIVE=1 (live Supabase + seeded admin + seeded families
 * with active program_enrollments). Skipped otherwise so CI stays green without
 * a live DB (integration correctness is NOT proven by CI — see verification memo).
 */
const LIVE = process.env.E2E_LIVE === "1";

test.describe("E5 Reparto — create + preview", () => {
  test.skip(!LIVE, "requires E2E_LIVE=1 (live Supabase + seeded data)");

  test("create a reparto and see it listed in borrador", async ({ page }) => {
    await page.goto("/familias");
    await page.getByRole("tab", { name: "Repartos" }).click();
    await page.getByRole("button", { name: "Nuevo reparto" }).click();

    await page.getByLabel(/Nombre/i).fill("Hoja de Firmas E2E");
    await page.getByLabel(/Fecha de inicio/i).fill("2026-07-06");
    await page.getByLabel(/Días de reparto/i).fill("3");
    await page.getByRole("button", { name: "Crear reparto" }).click();

    await expect(page.getByText("Reparto creado en borrador")).toBeVisible({ timeout: 5000 });
    // Lands on the detail/preview for the new draft round.
    await expect(page.getByText("Hoja de Firmas E2E")).toBeVisible();
  });
});
