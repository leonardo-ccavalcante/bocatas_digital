/**
 * ResultCard.a11y.test.tsx — Accessibility lock-in test (Gate 1 WCAG 2.1 AA).
 *
 * Asserts:
 *   - Each color state (registered, duplicate, not_found, error, offline)
 *     exposes a localized `aria-label`.
 *   - The result card is announced to assistive tech via `role="status"`.
 *
 * Renders to a static HTML string with `react-dom/server` because the project
 * vitest env is `node` (no jsdom). This keeps the test surgical and avoids
 * adding new dev dependencies.
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ResultCard } from "../components/ResultCard";
import type { CheckinContext } from "../machine/checkinMachine";

const baseContext: CheckinContext = {
  locationId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  programa: "comedor",
  isDemoMode: false,
  rawQrValue: null,
  personId: null,
  person: null,
  lastCheckinTime: null,
  restriccionesAlimentarias: null,
  errorMessage: null,
  offlineQueue: [],
};

type ResultState = "registered" | "duplicate" | "not_found" | "error" | "offline";

const STATES: Array<{ state: ResultState; expectedAriaLabel: string }> = [
  { state: "registered", expectedAriaLabel: "Check-in registrado correctamente" },
  { state: "duplicate", expectedAriaLabel: "Persona ya registrada hoy" },
  { state: "not_found", expectedAriaLabel: "Persona no encontrada" },
  { state: "error", expectedAriaLabel: "Error al registrar el check-in" },
  { state: "offline", expectedAriaLabel: "Check-in guardado sin conexión" },
];

describe("ResultCard a11y — aria-label per color state", () => {
  for (const { state, expectedAriaLabel } of STATES) {
    it(`exposes aria-label="${expectedAriaLabel}" for state "${state}"`, () => {
      const html = renderToStaticMarkup(
        <ResultCard
          stateValue={state}
          context={baseContext}
          onReset={() => {}}
        />
      );
      expect(html).toContain(`aria-label="${expectedAriaLabel}"`);
    });
  }
});

describe("ResultCard a11y — role=\"status\"", () => {
  it("renders a status role on the announcement container", () => {
    const html = renderToStaticMarkup(
      <ResultCard
        stateValue="registered"
        context={baseContext}
        onReset={() => {}}
      />
    );
    expect(html).toContain('role="status"');
  });

  it("emits role=\"status\" for every color state (low-literacy lock-in)", () => {
    for (const { state } of STATES) {
      const html = renderToStaticMarkup(
        <ResultCard
          stateValue={state}
          context={baseContext}
          onReset={() => {}}
        />
      );
      expect(html).toContain('role="status"');
    }
  });
});
