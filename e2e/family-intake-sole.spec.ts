import { test, expect } from "@playwright/test";

/**
 * JTBD (Sole, Families Coordinator):
 *   "When I receive a new family at intake, I want to register them digitally
 *    in under 5 minutes so I don't fall behind the queue and review what I'm
 *    about to save in one pass."
 *
 * Success criteria (E6 frictionless intake):
 *   - Wall-clock < 5 min from wizard open to confirmation
 *   - Titular is chosen from the persons registry (no duplicate person created)
 *   - The Step 6 "Resumen" review shows the ficha before the create call
 *   - Submitting navigates to the new family's detail page
 *
 * Selectors track the real 6-step IntakeWizard (Titular → Miembros →
 * Documentación → GUF → Autorizado → Resumen). The intake does NOT capture a
 * signature — that is the sibling delivery-signature feature (E10).
 *
 * Gating: requires E2E_LIVE=1 with a seeded admin/Sole user AND at least one
 * registered persona to select as titular. Skipped otherwise per Karpathy
 * guidance — the body is written end-to-end but we never pretend it passes
 * against an empty environment.
 */

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const isLive = process.env.E2E_LIVE === "1";

test.describe("Family intake (Sole) — JTBD <5 min", () => {
  test.skip(!isLive, "Set E2E_LIVE=1 with seeded user + a registered persona");

  test("registers a family via the 6-step wizard with a review before submit", async ({
    page,
  }) => {
    const startedAt = Date.now();

    // 1. Log in (seeded user)
    await page.goto("/login");
    await page.getByLabel(/correo|email/i).fill("sole@bocatas.test");
    await page.getByLabel(/contrase[ñn]a|password/i).fill("test-password");
    await page.getByRole("button", { name: /entrar|login/i }).click();

    // 2. Open the intake wizard
    await page.goto("/familias/nueva");

    // 3. Step 1 — search and select an existing titular, then a programa
    await page
      .getByPlaceholder(/buscar por nombre o apellidos/i)
      .fill("a"); // broad query to surface seeded personas
    await page
      .getByPlaceholder(/buscar por nombre o apellidos/i)
      .fill("ar");
    // Pick the first result row
    const firstResult = page.locator("button", { hasText: /\w+\s+\w+/ }).first();
    await firstResult.click();
    // Programa is required before advancing
    await page.getByRole("combobox").click();
    await page.getByRole("option").first().click();
    await page.getByRole("button", { name: /siguiente/i }).click();

    // 4. Steps 2–5 — accept defaults (members optional; flags off) and advance
    for (let i = 0; i < 4; i++) {
      await page.getByRole("button", { name: /siguiente/i }).click();
    }

    // 5. Step 6 — the review screen is the E6 addition: confirm it renders the
    //    summary before the create call.
    await expect(page.getByText(/revisa los datos/i)).toBeVisible();
    // "Titular" also appears in the step indicator, so scope to the summary heading.
    await expect(page.getByRole("heading", { name: /^Titular$/ })).toBeVisible();

    // 6. Submit
    await page.getByRole("button", { name: /registrar familia/i }).click();

    // 7. Confirmation — wizard navigates to the new family's detail page
    await expect(page).toHaveURL(/\/familias\/[0-9a-f-]{8,}/, { timeout: 10_000 });

    const elapsed = Date.now() - startedAt;
    expect(
      elapsed,
      `Intake should complete in <5 min, took ${elapsed}ms`,
    ).toBeLessThan(FIVE_MINUTES_MS);
  });
});
