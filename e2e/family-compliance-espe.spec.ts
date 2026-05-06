import { test, expect } from "@playwright/test";

/**
 * JTBD (Espe / Nacho, admin):
 *   "When I open the compliance dashboard, I want to see all CM-N counters
 *    in under 1 minute so I know which families need attention before I
 *    leave for the day."
 *
 * Success criterion (Phase B.8.3):
 *   - Wall-clock < 1 min from navigation to all counters rendered
 *   - All compliance counters present (CM-1..CM-5 today; CM-6 added when
 *     ComplianceDashboard.tsx ships it — currently the component renders
 *     CM-1..CM-5 only, see client/src/features/families/components/ComplianceDashboard.tsx)
 *
 * Gating: requires E2E_LIVE=1 (live Supabase + seeded admin user).
 */

const ONE_MINUTE_MS = 60 * 1000;
const isLive = process.env.E2E_LIVE === "1";

// Source-of-truth list of compliance counter codes rendered in the dashboard.
// Update this list when new CM-N codes ship in ComplianceDashboard.tsx.
const COMPLIANCE_CODES = ["CM-1", "CM-2", "CM-3", "CM-4", "CM-5"] as const;

test.describe("Family compliance dashboard (Espe) — JTBD <1 min", () => {
  test.skip(!isLive, "Set E2E_LIVE=1 with seeded admin user to run");

  test("admin sees all compliance counters within 1 minute", async ({ page }) => {
    const startedAt = Date.now();

    // 1. Espe (admin) authenticates
    await page.goto("/login");
    await page.getByLabel(/correo|email/i).fill("espe@bocatas.test");
    await page.getByLabel(/contrase[ñn]a|password/i).fill("test-password");
    await page.getByRole("button", { name: /entrar|login/i }).click();

    // 2. Open compliance dashboard
    await page.goto("/familias/cumplimiento");
    await expect(
      page.getByRole("heading", { name: /cumplimiento|compliance/i }),
    ).toBeVisible();

    // 3. Assert each CM-N counter is rendered
    for (const code of COMPLIANCE_CODES) {
      await expect(
        page.getByText(new RegExp(`${code}:`, "i")),
        `compliance counter ${code} must be visible`,
      ).toBeVisible();
    }

    const elapsed = Date.now() - startedAt;
    expect(
      elapsed,
      `Compliance dashboard should load in <1 min, took ${elapsed}ms`,
    ).toBeLessThan(ONE_MINUTE_MS);
  });
});
