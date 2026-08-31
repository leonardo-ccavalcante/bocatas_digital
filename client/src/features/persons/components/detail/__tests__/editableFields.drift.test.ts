/**
 * Guard de deriva de la lista de campos editables.
 *
 * Hay TRES copias a mano del mismo conjunto de campos: `PersonCreateSchema`
 * (cliente), `PersonCreateInput` (servidor, redeclarado a propósito para no
 * depender de los alias de Vite) y `CAMPOS_EDITABLES`. Sin este guard, añadir
 * una columna nueva al alta la dejaría para siempre fuera del formulario de
 * edición y nadie se enteraría.
 *
 * Se comprueba contra el esquema CANÓNICO DEL SERVIDOR, no contra una copia —
 * el mismo patrón que registrationDraft.test.ts, que importa
 * HIGH_RISK_FIELD_NAMES de server/_core/rlsRedaction. Se importa de
 * `persons/_shared.ts`, cuyo único import es zod: `update.ts` arrastraría
 * _core/trpc, el cliente de Supabase y node:crypto.
 *
 * Se descartó derivar la lista de `Object.keys(EditableSchema.shape)`: metería
 * `foto_perfil_url` y `foto_documento_url` —el round-trip de URL firmada que
 * AGENTS.md prohíbe— y el flag transitorio de consentimiento. Auto-derivar
 * convierte el comportamiento peligroso en el que sale por defecto.
 */
import { describe, it, expect } from "vitest";
import { PersonCreateInput } from "../../../../../../../server/routers/persons/_shared";
import { PersonCreateSchema } from "../../../schemas";
import {
  CAMPOS_EDITABLES,
  CAMPOS_NO_EDITABLES,
} from "../edit/editableFields";

const servidor = Object.keys(PersonCreateInput.shape);
const editables = new Set<string>(CAMPOS_EDITABLES);
const noEditables = new Set<string>(CAMPOS_NO_EDITABLES);

describe("CAMPOS_EDITABLES vs el esquema del servidor", () => {
  it("todo campo que el servidor acepta está CLASIFICADO", () => {
    // Una columna nueva rompe aquí, en vez de quedarse muda en la UI.
    const sinClasificar = servidor.filter((c) => !editables.has(c) && !noEditables.has(c));
    expect(sinClasificar).toEqual([]);
  });

  it("no se clasifica nada que el servidor no acepte", () => {
    const inventados = [...editables, ...noEditables].filter((c) => !servidor.includes(c));
    expect(inventados).toEqual([]);
  });

  it("las dos listas son disjuntas", () => {
    expect([...editables].filter((c) => noEditables.has(c))).toEqual([]);
  });

  it("la lista de exclusiones es exactamente esta", () => {
    // Fijada a propósito: "limpiar" cualquiera de estas cinco reintroduce un
    // fallo conocido, no simplifica nada.
    expect([...CAMPOS_NO_EDITABLES].sort()).toEqual([
      "colectivo_consentimiento",
      "fase_itinerario",
      "foto_documento_url",
      "foto_perfil_url",
      "program_ids",
    ]);
  });

  it("todo campo editable existe también en el esquema del cliente", () => {
    const clienteKeys = new Set(Object.keys(PersonCreateSchema.shape));
    expect(CAMPOS_EDITABLES.filter((c) => !clienteKeys.has(c))).toEqual([]);
  });
});
