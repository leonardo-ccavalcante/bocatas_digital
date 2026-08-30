/**
 * PersonaHeader — the KPI strip is collapsible to save screen space on mobile
 * (salvaged from the closed PR #141 sync). Hidden by default; a "Ver datos"
 * trigger reveals it, with a compact "Fase" summary while collapsed.
 */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { Database } from "@/lib/database.types";
import { PersonaHeader } from "../PersonaHeader";

type PersonRow = Database["public"]["Tables"]["persons"]["Row"];

const person = {
  id: "11111111-1111-4111-8111-111111111111",
  nombre: "Ana",
  apellidos: "López",
  idioma_principal: "es",
  fecha_nacimiento: "1990-01-01",
  created_at: "2026-01-01T00:00:00Z",
  empadronado: true,
  fase_itinerario: "activo",
} as unknown as PersonRow;

afterEach(cleanup);

describe("PersonaHeader collapsible KPI (#141 salvage)", () => {
  it("hides the KPI grid by default and reveals it on toggle", () => {
    render(<PersonaHeader person={person} visitas={5} onConsent={vi.fn()} />);

    // Collapsed: the trigger says "Ver datos"; the KPI cells are not rendered.
    const trigger = screen.getByRole("button", { name: "Ver datos" });
    expect(screen.queryByText("Visitas")).toBeNull();

    fireEvent.click(trigger);

    // Expanded: KPI cells appear and the trigger flips to "Ocultar datos".
    expect(screen.getByText("Visitas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ocultar datos" })).toBeInTheDocument();
  });
});
