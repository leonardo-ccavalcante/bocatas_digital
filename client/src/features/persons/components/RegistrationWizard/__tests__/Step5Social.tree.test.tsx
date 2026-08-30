/**
 * Step5Social.tree.test.tsx — «los cursos aparecen junto a los programas» (ALTAS-6).
 *
 * La jerarquía existe en la BD desde ADR-0013 (`programs.parent_id`, `tipo`,
 * `inscribible`) y las pantallas de Programas la respetan, pero el alta lee otro
 * endpoint (`persons.programs`) que nunca pidió esas columnas, así que pintaba
 * Formación, Cocina, CAM y Panadería como botones hermanos de Comedor — y dejaba
 * inscribir directamente en contenedores que por diseño no admiten inscripción.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Step5Social } from "../steps/Step5Social";
import type { ProgramRow } from "../_shared";

afterEach(cleanup);

const COMEDOR: ProgramRow = {
  id: "p-comedor", name: "Comedor Social", icon: "🍽️", slug: "comedor",
  parent_id: null, tipo: "continuo", inscribible: true,
};
const FORMACION: ProgramRow = {
  id: "p-formacion", name: "Formación", icon: "📚", slug: "formacion",
  parent_id: null, tipo: "contenedor", inscribible: false,
};
const COCINA: ProgramRow = {
  id: "p-cocina", name: "Curso de Cocina", icon: "🍳", slug: "curso_cocina",
  parent_id: "p-formacion", tipo: "curso", inscribible: true,
};
const CAM: ProgramRow = {
  id: "p-cam", name: "Curso de Camarero (CAM)", icon: "🍽️", slug: "curso_cam",
  parent_id: "p-formacion", tipo: "curso", inscribible: true,
};

const PROGRAMS = [COMEDOR, FORMACION, COCINA, CAM];

function renderStep(selected: string[] = []) {
  return render(
    <Step5Social
      register={(() => ({})) as never}
      programs={PROGRAMS}
      watchedProgramIds={selected}
      toggleProgram={() => {}}
      hasFamilia={false}
    />
  );
}

describe("Step5Social — árbol de programas", () => {
  it("no pinta los cursos como programas de primer nivel", () => {
    renderStep();
    const raiz = screen.getByTestId("programas-raiz");
    expect(within(raiz).getByRole("button", { name: /Comedor Social/ })).toBeInTheDocument();
    expect(within(raiz).queryByRole("button", { name: /Curso de Cocina/ })).toBeNull();
    expect(within(raiz).queryByRole("button", { name: /Curso de Camarero/ })).toBeNull();
  });

  it("agrupa los cursos dentro del desplegable de Formación", async () => {
    const user = userEvent.setup();
    renderStep();

    await user.click(screen.getByRole("button", { name: /Formación/ }));

    const grupo = screen.getByTestId("programa-hijos-p-formacion");
    expect(within(grupo).getByRole("button", { name: /Curso de Cocina/ })).toBeInTheDocument();
    expect(within(grupo).getByRole("button", { name: /Curso de Camarero/ })).toBeInTheDocument();
  });

  it("un contenedor no se puede seleccionar como programa", () => {
    renderStep();
    const formacion = screen.getByRole("button", { name: /Formación/ });
    expect(formacion).not.toHaveAttribute("aria-pressed");
  });

  it("abre el desplegable cuando ya hay un hijo seleccionado", () => {
    renderStep([COCINA.id]);
    const grupo = screen.getByTestId("programa-hijos-p-formacion");
    expect(within(grupo).getByRole("button", { name: /Curso de Cocina/ })).toBeInTheDocument();
  });
});
