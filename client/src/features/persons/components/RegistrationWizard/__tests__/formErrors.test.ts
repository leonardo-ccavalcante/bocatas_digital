import { describe, it, expect } from "vitest";
import { PersonCreateSchema } from "../../../schemas";
import {
  describirErrores,
  mensajeDeErrores,
  primeraFaseConError,
} from "../_formErrors";

describe("describirErrores", () => {
  it("nombra el campo como se ve en pantalla y dice el motivo", () => {
    const errores = describirErrores([
      { path: ["fecha_nacimiento"], message: "La persona debe tener al menos 5 años" },
    ]);
    expect(errores).toEqual([
      {
        campo: "fecha_nacimiento",
        etiqueta: "Fecha de nacimiento",
        fase: 1,
        mensaje: "La persona debe tener al menos 5 años",
      },
    ]);
  });

  it("se queda con el primer motivo de cada campo", () => {
    const errores = describirErrores([
      { path: ["email"], message: "Email inválido" },
      { path: ["email"], message: "Otro motivo" },
    ]);
    expect(errores).toHaveLength(1);
    expect(errores[0].mensaje).toBe("Email inválido");
  });

  it("no se rompe con un campo que no esté en el mapa", () => {
    const errores = describirErrores([
      { path: ["campo_nuevo_sin_mapear"], message: "Algo" },
    ]);
    expect(errores[0].etiqueta).toBe("campo_nuevo_sin_mapear");
    expect(errores[0].fase).toBeNull();
  });
});

describe("mensajeDeErrores", () => {
  it("agrupa por paso para que se sepa dónde mirar", () => {
    const texto = mensajeDeErrores(
      describirErrores([
        { path: ["nombre"], message: "El nombre es obligatorio" },
        { path: ["codigo_postal"], message: "Debe tener 5 dígitos" },
      ])
    );
    expect(texto).toBe(
      "Identidad — Nombre: El nombre es obligatorio · Contacto — Código postal: Debe tener 5 dígitos"
    );
  });

  it("nunca devuelve una cadena vacía", () => {
    expect(mensajeDeErrores([])).toBe("Revisa los datos antes de continuar.");
  });
});

describe("primeraFaseConError", () => {
  it("devuelve el paso más temprano con fallo", () => {
    const campos = describirErrores([
      { path: ["program_ids"], message: "x" },
      { path: ["telefono"], message: "y" },
    ]);
    expect(primeraFaseConError(campos)).toBe(2);
  });

  it("devuelve null cuando ningún campo tiene paso conocido", () => {
    expect(primeraFaseConError(describirErrores([{ path: ["raro"], message: "x" }]))).toBeNull();
  });
});

describe("integración con el esquema real", () => {
  it("traduce un formulario vacío a nombres de pantalla, no a columnas", () => {
    const parsed = PersonCreateSchema.safeParse({});
    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    const texto = mensajeDeErrores(describirErrores(parsed.error.issues));
    // Lo que veía el equipo antes eran las claves crudas.
    expect(texto).not.toMatch(/fecha_nacimiento|canal_llegada|idioma_principal/);
    expect(texto).toContain("Fecha de nacimiento");
    expect(texto).toContain("Canal de llegada");
    expect(texto).toContain("Identidad — ");
  });
});
