/**
 * TDD regression test for Bug: Delete button missing for non-borrador repartos.
 *
 * Root cause: RepartoList.tsx had `{r.estado === "borrador" && <Button>Eliminar</Button>}`
 * which hides the delete button for repartos with estado "activa" or "cerrada".
 *
 * Fix: Remove the estado condition — admin can delete any reparto (backend already enforces
 * the audit log and allows all estados via rounds-schedule.ts deleteRound procedure).
 *
 * This test verifies:
 * 1. The delete button is NOT gated by r.estado === "borrador"
 * 2. The delete button IS rendered for all repartos (no estado condition)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const repartoListPath = path.resolve(
  __dirname,
  "../components/RepartoList.tsx",
);

const source = readFileSync(repartoListPath, "utf-8");

describe("RepartoList — botón Eliminar visible para todos los estados", () => {
  it("NO debe condicionar el botón Eliminar a r.estado === 'borrador'", () => {
    // This is the root cause of the bug: the delete button was hidden for non-borrador repartos
    expect(source).not.toContain('r.estado === "borrador"');
  });

  it("debe renderizar el botón Eliminar sin condición de estado", () => {
    // The Eliminar button should exist in the component
    expect(source).toContain("Eliminar");
    // And it should NOT be wrapped in a borrador-only condition
    expect(source).not.toMatch(/estado.*borrador.*Eliminar|Eliminar.*estado.*borrador/s);
  });
});
