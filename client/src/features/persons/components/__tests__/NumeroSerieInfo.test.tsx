/**
 * NumeroSerieInfo.test.tsx — la (i) del "Nº de serie del formulario" (ALTAS-10).
 *
 * El campo no daba ninguna pista del formato salvo un placeholder
 * ("BCT-2026-00142") que además contradice el criterio real del equipo. Aquí se
 * fija que la ayuda existe, que enumera los tres casos y que se abre con
 * teclado: el dispositivo objetivo es un Android de gama baja, donde un tooltip
 * de hover es inservible, así que la ayuda va en un popover que se toca.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NumeroSerieInfo } from "../NumeroSerieInfo";

afterEach(cleanup);

describe("NumeroSerieInfo", () => {
  it("expone un botón de ayuda accesible", () => {
    render(<NumeroSerieInfo />);
    expect(
      screen.getByRole("button", { name: /formato del n.º de serie/i })
    ).toBeInTheDocument();
  });

  it("explica los tres casos al abrirlo", async () => {
    const user = userEvent.setup();
    render(<NumeroSerieInfo />);

    await user.click(screen.getByRole("button", { name: /formato del n.º de serie/i }));

    expect(await screen.findByText(/familias/i)).toBeInTheDocument();
    expect(screen.getByText(/código familia_nombre y apellidos/i)).toBeInTheDocument();
    expect(screen.getByText(/fecha americana_curso_nombre y apellidos/i)).toBeInTheDocument();
    expect(screen.getByText(/fecha americana_programa_nombre y apellidos/i)).toBeInTheDocument();
  });
});
