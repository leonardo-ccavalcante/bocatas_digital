import { describe, it, expect } from "vitest";
import {
  groupByFamilyNumber,
  validateGroup,
  assembleFamilyGroups,
} from "./csvLegacyFamiliasGroup";
import type { CleanRow } from "../shared/legacyFamiliasTypes";

function row(overrides: Partial<CleanRow> & { legacy_numero_familia: string; row_number: number }): CleanRow {
  return {
    legacy_numero_familia: overrides.legacy_numero_familia,
    row_number: overrides.row_number,
    legacy_numero_orden: overrides.legacy_numero_orden,
    is_titular: overrides.is_titular ?? false,
    parentesco_original: overrides.parentesco_original ?? null,
    fecha_alta: overrides.fecha_alta ?? null,
    person: overrides.person ?? {
      nombre: "Test",
      apellidos: "Person",
      fecha_nacimiento: null,
      genero: null,
      pais_origen: null,
      telefono: null,
      email: null,
      direccion: null,
      municipio: null,
      tipo_documento: null,
      numero_documento: null,
      nivel_estudios: null,
      situacion_laboral: null,
      observaciones: null,
      metadata: { colectivos: [], legacy_row: overrides.row_number },
    },
    relacion_db: overrides.relacion_db ?? "other",
    warnings: overrides.warnings ?? [],
  };
}

describe("groupByFamilyNumber", () => {
  it("groups rows sharing legacy_numero_familia", () => {
    const rows = [
      row({ legacy_numero_familia: "1030", row_number: 4, is_titular: true }),
      row({ legacy_numero_familia: "1030", row_number: 5 }),
      row({ legacy_numero_familia: "1032", row_number: 6, is_titular: true }),
    ];
    const groups = groupByFamilyNumber(rows);
    expect(groups.size).toBe(2);
    expect(groups.get("1030")?.length).toBe(2);
    expect(groups.get("1032")?.length).toBe(1);
  });

  it("preserves order of first appearance", () => {
    const rows = [
      row({ legacy_numero_familia: "9", row_number: 4, is_titular: true }),
      row({ legacy_numero_familia: "1", row_number: 5, is_titular: true }),
      row({ legacy_numero_familia: "9", row_number: 6 }),
    ];
    const groups = groupByFamilyNumber(rows);
    expect(Array.from(groups.keys())).toEqual(["9", "1"]);
  });
});

describe("validateGroup — titular checks", () => {
  it("exactly 1 titular → ok with titular_index", () => {
    const r = validateGroup([
      row({ legacy_numero_familia: "1030", row_number: 4, is_titular: true }),
      row({ legacy_numero_familia: "1030", row_number: 5 }),
    ]);
    expect(r.titular_index).toBe(0);
    expect(r.errors).toEqual([]);
  });

  it("zero titulares → error", () => {
    const r = validateGroup([
      row({ legacy_numero_familia: "1030", row_number: 4 }),
      row({ legacy_numero_familia: "1030", row_number: 5 }),
    ]);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0].field).toBe("cabeza_familia");
    expect(r.errors[0].message).toContain("ningún titular");
  });

  it("multiple titulares → error", () => {
    const r = validateGroup([
      row({ legacy_numero_familia: "1030", row_number: 4, is_titular: true }),
      row({ legacy_numero_familia: "1030", row_number: 5, is_titular: true }),
    ]);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0].field).toBe("cabeza_familia");
    expect(r.errors[0].message).toContain("varios titulares");
  });

  it("single-person family with titular → ok", () => {
    const r = validateGroup([
      row({ legacy_numero_familia: "1030", row_number: 4, is_titular: true }),
    ]);
    expect(r.titular_index).toBe(0);
    expect(r.errors).toEqual([]);
  });

  it("titular always sorted to index 0", () => {
    const r = validateGroup([
      row({ legacy_numero_familia: "1030", row_number: 4 }),
      row({ legacy_numero_familia: "1030", row_number: 5, is_titular: true }),
      row({ legacy_numero_familia: "1030", row_number: 6 }),
    ]);
    expect(r.titular_index).toBe(0);
    expect(r.rows[0].is_titular).toBe(true);
    expect(r.rows[0].row_number).toBe(5);
    expect(r.errors).toEqual([]);
  });
});

describe("assembleFamilyGroups", () => {
  it("returns one FamilyGroup per legacy_numero_familia", () => {
    const groups = assembleFamilyGroups([
      row({ legacy_numero_familia: "1030", row_number: 4, is_titular: true }),
      row({ legacy_numero_familia: "1030", row_number: 5 }),
      row({ legacy_numero_familia: "1032", row_number: 6, is_titular: true }),
    ]);
    expect(groups.length).toBe(2);
    expect(groups[0].legacy_numero_familia).toBe("1030");
    expect(groups[0].rows.length).toBe(2);
    expect(groups[0].titular_index).toBe(0);
  });

  it("group with zero titulares carries error and titular_index=0", () => {
    const groups = assembleFamilyGroups([
      row({ legacy_numero_familia: "1030", row_number: 4 }),
      row({ legacy_numero_familia: "1030", row_number: 5 }),
    ]);
    expect(groups[0].errors.length).toBeGreaterThan(0);
    expect(groups[0].titular_index).toBe(0);
  });

  it("default flags: family_already_imported=false, person_dedup_hits=[]", () => {
    const groups = assembleFamilyGroups([
      row({ legacy_numero_familia: "1030", row_number: 4, is_titular: true }),
    ]);
    expect(groups[0].family_already_imported).toBe(false);
    expect(groups[0].person_dedup_hits).toEqual([]);
  });
});
