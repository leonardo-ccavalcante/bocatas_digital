/**
 * CloseoutRosterList — accent/case-insensitive person search (salvaged from the
 * closed PR #141 sync). Lets a coordinator find a family without scrolling.
 */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CloseoutRosterList } from "../CloseoutRosterList";

afterEach(cleanup);

const pending = [
  { id: "a", family_id: "f1", expediente: "E1", total_miembros: 3, nombre_titular: "María Gómez", es_sugerido: false },
  { id: "b", family_id: "f2", expediente: "E2", total_miembros: 2, nombre_titular: "Juan Pérez", es_sugerido: false },
];

function renderList() {
  return render(
    <CloseoutRosterList pending={pending} attendedHere={[]} isReadOnly={false} onMark={vi.fn()} />
  );
}

describe("CloseoutRosterList search (#141 salvage)", () => {
  it("filters by name, accent- and case-insensitively", () => {
    renderList();
    expect(screen.getByText("María Gómez")).toBeInTheDocument();
    expect(screen.getByText("Juan Pérez")).toBeInTheDocument();

    // "gomez" (no accent, lowercase) matches "María Gómez" only.
    fireEvent.change(screen.getByLabelText("Buscar familia en la lista"), { target: { value: "gomez" } });

    expect(screen.getByText("María Gómez")).toBeInTheDocument();
    expect(screen.queryByText("Juan Pérez")).toBeNull();
  });

  it("shows a no-results message when nothing matches", () => {
    renderList();
    fireEvent.change(screen.getByLabelText("Buscar familia en la lista"), { target: { value: "zzz" } });
    expect(screen.getByText(/No hay resultados/)).toBeInTheDocument();
  });
});
