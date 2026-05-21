/**
 * Tests for <FamiliaMemberRow /> + parentescoLabel.
 *
 * Member fields (parentesco, age) come from REAL `familia_miembros` columns
 * (rol/relacion/fecha_nacimiento). Absent fields → em-dash, never invented.
 */

import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import { FamiliaMemberRow, parentescoLabel } from "../FamiliaMemberRow";

afterEach(cleanup);

function renderRow(member: React.ComponentProps<typeof FamiliaMemberRow>["member"]) {
  return render(
    <table>
      <tbody>
        <FamiliaMemberRow member={member} uploadedTipos={new Set()} />
      </tbody>
    </table>,
  );
}

describe("parentescoLabel", () => {
  it("maps rol head_of_household → Titular", () => {
    expect(parentescoLabel("head_of_household", null)).toBe("Titular");
  });

  it("falls back to relacion when rol is unknown", () => {
    expect(parentescoLabel(null, "child")).toBe("Hijo/a");
  });

  it("returns em-dash when both are missing/unknown", () => {
    expect(parentescoLabel(null, null)).toBe("—");
    expect(parentescoLabel("nonsense", "nonsense")).toBe("—");
  });
});

describe("<FamiliaMemberRow />", () => {
  it("renders the member's full name and mapped parentesco", () => {
    renderRow({
      id: "m1",
      nombre: "Ana",
      apellidos: "García López",
      rol: "head_of_household",
      fecha_nacimiento: "1990-01-01",
    });
    const row = screen.getByRole("row");
    expect(within(row).getByText("Ana García López")).toBeInTheDocument();
    expect(within(row).getByText("Titular")).toBeInTheDocument();
  });

  it("renders em-dash in the age cell when fecha_nacimiento is missing", () => {
    renderRow({ id: "m2", nombre: "Sin Fecha", fecha_nacimiento: null });
    const ageCell = screen.getByTestId("member-age");
    expect(ageCell).toHaveTextContent("—");
  });

  it("renders a numeric age in the age cell when fecha_nacimiento is set", () => {
    // Pick a date far enough in the past that the age will always be > 0.
    renderRow({ id: "m3", nombre: "Con Fecha", fecha_nacimiento: "1990-01-01" });
    const ageCell = screen.getByTestId("member-age");
    // Age must be a positive integer string, not an em-dash.
    expect(ageCell.textContent).toMatch(/^\d+$/);
    expect(Number(ageCell.textContent)).toBeGreaterThan(0);
  });
});
