import { test, expect } from "@playwright/test";

/**
 * JTBD (Sole, Families Coordinator):
 *   "When I receive a new family at intake, I want to register them digitally
 *    in under 5 minutes so I don't fall behind the queue and capture
 *    consent + GUF flag in one pass."
 *
 * Success criterion (Phase B.8.1):
 *   - Wall-clock < 5 min from form open to intake confirmation
 *   - Digital signature captured
 *   - GUF (alta_en_guf) flag set on family record
 *
 * Gating: requires E2E_LIVE=1 (live Supabase + seeded Sole user). Skipped
 * otherwise per Karpathy guidance — the spec body is written end-to-end but
 * we do NOT pretend it passes against an empty environment.
 */

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const isLive = process.env.E2E_LIVE === "1";

test.describe("Family intake (Sole) — JTBD <5 min", () => {
  test.skip(!isLive, "Set E2E_LIVE=1 with seeded Sole user to run");

  test("registers a new family with consent + GUF flag in under 5 minutes", async ({
    page,
  }) => {
    const startedAt = Date.now();

    // 1. Sole logs in (assumes seeded user "sole@bocatas.test")
    await page.goto("/login");
    await page.getByLabel(/correo|email/i).fill("sole@bocatas.test");
    await page.getByLabel(/contrase[ñn]a|password/i).fill("test-password");
    await page.getByRole("button", { name: /entrar|login/i }).click();

    // 2. Open the new family wizard
    await page.goto("/familias/nueva");
    await expect(
      page.getByRole("heading", { name: /nueva familia|registro/i }),
    ).toBeVisible();

    // 3. Step 1 — household basics
    await page.getByLabel(/nombre.*familia|apellidos/i).fill("García López");
    await page.getByLabel(/contacto principal/i).fill("Juan García");
    await page.getByLabel(/tel[eé]fono/i).fill("+34600100001");
    await page.getByLabel(/direcci[oó]n/i).fill("Calle Mayor 1, Madrid");
    await page.getByRole("button", { name: /siguiente|next/i }).click();

    // 4. Step 2 — members (titular only for the test)
    await page
      .getByLabel(/nombre miembro|nombre del titular/i)
      .fill("María García");
    await page.getByLabel(/fecha.*nacimiento/i).fill("1985-03-20");
    await page.getByRole("button", { name: /siguiente|next/i }).click();

    // 5. Step 3 — consent (Bocatas + Banco de Alimentos) and GUF flag
    await page.getByLabel(/consentimiento bocatas/i).check();
    await page.getByLabel(/consentimiento.*banco.*alimentos/i).check();
    await page.getByLabel(/alta.*guf|registrad[ao].*guf/i).check();

    // 6. Digital signature — canvas stroke is enough to register a signature
    const signatureCanvas = page.locator('canvas[data-role="signature"]');
    await expect(signatureCanvas).toBeVisible();
    const box = await signatureCanvas.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      await page.mouse.move(box.x + 10, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width - 10, box.y + box.height / 2);
      await page.mouse.up();
    }

    // 7. Submit
    await page.getByRole("button", { name: /finalizar|registrar/i }).click();

    // 8. Confirmation screen visible and GUF flag echoed back
    await expect(
      page.getByRole("heading", { name: /familia registrada|alta completada/i }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/GUF/i)).toBeVisible();
    await expect(page.getByText(/firma capturada|signature captured/i))
      .toBeVisible();

    const elapsed = Date.now() - startedAt;
    expect(
      elapsed,
      `Intake should complete in <5 min, took ${elapsed}ms`,
    ).toBeLessThan(FIVE_MINUTES_MS);
  });
});
