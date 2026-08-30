/**
 * programsFallback.test.ts — no puede quedar un catálogo falso de reserva.
 *
 * `PROGRAMS_SEED_FALLBACK` traía slugs con guion (`comedor-social`) y UUIDs
 * inventados, y `usePrograms` lo usaba en cuanto la consulta devolvía vacío.
 * Inscribir a alguien contra uno de esos UUIDs revienta la FK, y el catálogo
 * plausible-pero-falso es justo lo que tapó el desfase del slug del Programa
 * Familias. Guarda a nivel de fuente, como large-payload-paths.test.ts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const leer = (rel: string) => readFileSync(resolve(__dirname, rel), "utf8");

describe("catálogo de programas del alta", () => {
  it("usePrograms no inyecta datos de reserva", () => {
    const src = leer("../hooks/usePrograms.ts");
    expect(src).not.toMatch(/PROGRAMS_SEED_FALLBACK/);
  });

  it("la constante falsa ya no existe", () => {
    expect(leer("../schemas/labels.ts")).not.toMatch(/PROGRAMS_SEED_FALLBACK/);
  });
});
