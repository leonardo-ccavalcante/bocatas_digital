import { test, expect } from "@playwright/test";

/**
 * JTBD (Volunteer, voluntario role):
 *   "When a family arrives for delivery, I want to verify identity and record
 *    the delivery (with signature) in under 2 minutes, without ever seeing
 *    the family's legal/migratory data."
 *
 * Success criterion (Phase B.8.2):
 *   - Wall-clock < 2 min from family lookup to delivery confirmation
 *   - Digital signature captured
 *   - Audit row visible (or assertion deferred when inaccessible to voluntario)
 *   - HIGH-RISK FIELDS NOT VISIBLE: extends Phase B.2 RLS contract to UI:
 *     situacion_legal, foto_documento_url, recorrido_migratorio MUST NOT
 *     appear anywhere in the rendered family detail page for voluntario.
 *
 * Gating: requires E2E_LIVE=1 (live Supabase, seeded family + voluntario JWT).
 */

const TWO_MINUTES_MS = 2 * 60 * 1000;
const isLive = process.env.E2E_LIVE === "1";

const HIGH_RISK_FIELD_LABELS = [
  /situaci[oó]n legal/i,
  /foto.*documento/i,
  /recorrido migratorio/i,
];

test.describe("Family delivery (Volunteer) — JTBD <2 min + RLS UI contract", () => {
  test.skip(!isLive, "Set E2E_LIVE=1 with seeded volunteer + family to run");

  test("voluntario verifies identity, records delivery, never sees high-risk fields", async ({
    page,
  }) => {
    const startedAt = Date.now();

    // 1. Volunteer authenticates (seeded voluntario account)
    await page.goto("/login");
    await page.getByLabel(/correo|email/i).fill("voluntario@bocatas.test");
    await page.getByLabel(/contrase[ñn]a|password/i).fill("test-password");
    await page.getByRole("button", { name: /entrar|login/i }).click();

    // 2. Verify identity flow
    await page.goto("/familias/verificar");
    await page.getByLabel(/buscar.*familia|c[oó]digo|tel[eé]fono/i).fill(
      "GUF-001",
    );
    await page.getByRole("button", { name: /buscar|search/i }).click();

    await expect(page.getByText(/García López/i)).toBeVisible();

    // 3. RLS UI assertion — high-risk fields MUST NOT appear for voluntario.
    //    This extends the Phase B.2 contract from API/RLS to rendered UI.
    for (const label of HIGH_RISK_FIELD_LABELS) {
      await expect(
        page.getByText(label),
        `voluntario must not see high-risk field matching ${label}`,
      ).toHaveCount(0);
    }

    // 4. Confirm identity match and proceed to delivery
    await page.getByRole("button", { name: /confirmar identidad|verificar/i })
      .click();
    await page.goto("/familias/entregas");

    // 5. Record the delivery
    await page.getByRole("button", { name: /nueva entrega|registrar entrega/i })
      .click();
    await page.getByLabel(/familia/i).fill("GUF-001");
    await page.getByRole("option", { name: /García López/i }).click();
    await page.getByLabel(/cantidad|kg|bolsas/i).fill("1");

    // 6. Signature
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

    // 7. Submit delivery
    await page.getByRole("button", { name: /confirmar|registrar entrega/i })
      .click();
    await expect(
      page.getByText(/entrega registrada|delivery recorded/i),
    ).toBeVisible({ timeout: 10_000 });

    const elapsed = Date.now() - startedAt;
    expect(
      elapsed,
      `Delivery should complete in <2 min, took ${elapsed}ms`,
    ).toBeLessThan(TWO_MINUTES_MS);

    // 8. Audit assertion: voluntario MAY not have read access to audit log;
    //    surface as soft check — if audit page is reachable, expect a row.
    const auditResponse = await page.goto("/familias/auditoria", {
      waitUntil: "domcontentloaded",
    });
    if (auditResponse && auditResponse.status() === 200) {
      await expect(page.getByText(/entrega|delivery/i).first()).toBeVisible();
    }
    // Otherwise: deferred to admin/Espe spec — voluntario lacking audit
    // visibility is the expected RLS posture, not a test failure.
  });
});
