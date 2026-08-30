/**
 * ResumenTab.labels.test.tsx — la ficha pintaba los valores CRUDOS.
 *
 * `ResumenTab` no importaba ningún mapa de etiquetas: mostraba literalmente
 * `piso_compartido_alquiler` o `sin_permiso_trabajo`. Pasó desapercibido
 * mientras los valores se leían más o menos, pero los niveles agregados de
 * ALTAS-4 (`postsecundaria_no_superior`, `superior`) lo dejan en evidencia.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ResumenTab } from "../ResumenTab";
import type { Database } from "@/lib/database.types";

type PersonRow = Database["public"]["Tables"]["persons"]["Row"];

afterEach(cleanup);

function person(overrides: Partial<PersonRow>): PersonRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    nombre: "Ana",
    apellidos: "García",
    tipo_vivienda: null,
    nivel_estudios: null,
    situacion_laboral: null,
    nivel_ingresos: null,
    ...overrides,
  } as PersonRow;
}

describe("ResumenTab — etiquetas legibles", () => {
  it("traduce el nivel de estudios agregado", () => {
    render(
      <ResumenTab person={person({ nivel_estudios: "postsecundaria_no_superior" })} isAdmin={false} />
    );
    expect(screen.getByText(/Educación post secundaria no superior/i)).toBeInTheDocument();
    expect(screen.queryByText("postsecundaria_no_superior")).not.toBeInTheDocument();
  });

  it("traduce el tipo de vivienda", () => {
    render(<ResumenTab person={person({ tipo_vivienda: "piso_entidad_social" })} isAdmin={false} />);
    expect(screen.getByText(/Piso de entidad social/i)).toBeInTheDocument();
  });

  it("traduce la situación laboral", () => {
    render(
      <ResumenTab person={person({ situacion_laboral: "sin_permiso_trabajo" })} isAdmin={false} />
    );
    expect(screen.getByText(/Sin permiso de trabajo/i)).toBeInTheDocument();
  });

  it("traduce el nivel de ingresos", () => {
    render(<ResumenTab person={person({ nivel_ingresos: "menos_500" })} isAdmin={false} />);
    expect(screen.getByText(/Menos de 500/i)).toBeInTheDocument();
  });

  it("sigue mostrando el valor histórico que ya no se ofrece", () => {
    render(<ResumenTab person={person({ tipo_vivienda: "centro_acogida" })} isAdmin={false} />);
    expect(screen.getByText(/Centro de acogida/i)).toBeInTheDocument();
  });
});
