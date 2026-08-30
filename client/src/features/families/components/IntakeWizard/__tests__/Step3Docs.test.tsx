/**
 * Step3Docs.test.tsx — «no sabemos de qué miembro estamos hablando» (FAMILIAS-1).
 *
 * El paso 3 pinta seis interruptores que escriben en columnas booleanas de
 * `families`: son de HOGAR, no de persona. Pero tres de ellos (identidad y los
 * dos consentimientos) el dominio los trata por miembro ≥14
 * (PER_MEMBER_DOC_TYPES), así que el voluntario los leía como si fueran de
 * alguien concreto y no sabía de quién.
 *
 * Sin cambiar el modelo de datos: separar lo que es de la familia de lo que
 * cubre a todo el hogar, y decir con nombre y apellidos a quién cubre.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Step3Docs } from "../Step3Docs";
import type { FamilyMember } from "../../../schemas";

afterEach(cleanup);

const MEMBERS = [
  { nombre: "Yassine", apellidos: "El Idrissi", parentesco: "hijo_a", es_menor: false },
  { nombre: "Salma", apellidos: "El Idrissi", parentesco: "esposo_a", es_menor: false },
] as unknown as FamilyMember[];

function fakeForm(values: Record<string, unknown> = {}) {
  return {
    watch: (k: string) => values[k],
    setValue: () => {},
    register: () => ({}),
  };
}

describe("Step3Docs — de quién es cada documento", () => {
  it("nombra a los miembros que cubren los documentos del hogar", () => {
    render(<Step3Docs form={fakeForm()} members={MEMBERS} />);
    expect(screen.getByTestId("cobertura-miembros")).toHaveTextContent(/Yassine El Idrissi/);
    expect(screen.getByTestId("cobertura-miembros")).toHaveTextContent(/Salma El Idrissi/);
  });

  it("separa los documentos de la familia de los que cubren a cada miembro", () => {
    render(<Step3Docs form={fakeForm()} members={MEMBERS} />);
    expect(screen.getByText(/Documentos de la familia/i)).toBeInTheDocument();
    expect(screen.getByText(/Documentos de cada miembro/i)).toBeInTheDocument();
  });

  it("cada interruptor tiene nombre accesible (WCAG 4.1.2)", () => {
    render(<Step3Docs form={fakeForm()} members={MEMBERS} />);
    expect(
      screen.getByRole("switch", { name: /Padrón municipal recibido/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: /Documentos de identidad recibidos/i })
    ).toBeInTheDocument();
  });

  it("marca el informe social como obligatorio", () => {
    render(<Step3Docs form={fakeForm()} members={MEMBERS} />);
    const informe = screen.getByRole("switch", { name: /Informe social recibido/i });
    expect(informe).toHaveAttribute("aria-required", "true");
  });

  it("aguanta un hogar sin miembros añadidos", () => {
    render(<Step3Docs form={fakeForm()} members={[]} />);
    expect(screen.getByTestId("cobertura-miembros")).toHaveTextContent(/titular/i);
  });
});
