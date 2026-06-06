/**
 * legacy-import-phase4.test.ts — Regression tests for Phase 4 additions:
 *
 *  1. classifyGroup logic (ok / warnings / errors / duplicates)
 *  2. excluded_family_numbers: families in the exclusion list are counted
 *     as skipped, not imported — verified through the group classification
 *     and the confirm input Zod schema.
 *  3. confirmLegacyImport input schema accepts the new optional field.
 *  4. familiasAImportar calculation respects skipWarnings + updateExisting.
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { assembleFamilyGroups } from "../../../csvLegacyFamiliasGroup";
import {
  parseCSVDocument,
  resolveColumnMap,
  fieldsToLegacyRow,
  REQUIRED_KEYS,
} from "../../../csvLegacyFamiliasParser";
import { parseRow, type ParseRowResult } from "../../../csvLegacyFamiliasMapper";
import type { FamilyGroup } from "../../../../shared/legacyFamiliasTypes";

// ── Helpers ──────────────────────────────────────────────────────────────────

const FIXTURE_HEADER =
  '"NÚMERO DE ORDEN","NUMERO FAMILIA BOCATAS","FECHA ALTA","NOMBRE","APELLIDOS","SEXO",' +
  '"TELEFONO","DNI/NIE/ PASAPORTE","CABEZA DE FAMILIA","PAIS","Fecha Nacimiento","EMAIL",' +
  '"DIRECCION","CODIGO POSTAL","Localidad","NOTAS PARA INFORME SOCIAL",' +
  '"Nivel de estudios finalizados","Situación Laboral","Otras Características"';

function transformCsv(csv: string): FamilyGroup[] {
  const records = parseCSVDocument(csv);
  let headerIdx = -1;
  let columnMap: ReturnType<typeof resolveColumnMap> | null = null;
  for (let i = 0; i < Math.min(records.length, 10); i++) {
    const candidate = resolveColumnMap(records[i]);
    if (REQUIRED_KEYS.every((k) => candidate.has(k))) {
      headerIdx = i;
      columnMap = candidate;
      break;
    }
  }
  if (headerIdx === -1 || !columnMap) throw new Error("Header not found");
  const famIdx = columnMap.get("numero_familia")!;
  const data = records.slice(headerIdx + 1);
  const cleanRows: Extract<ParseRowResult, { ok: true }>["row"][] = [];
  for (let r = 0; r < data.length; r++) {
    const rec = data[r];
    if (rec.every((c) => c.trim() === "")) continue;
    if (!(rec[famIdx] ?? "").trim()) continue;
    const legacy = fieldsToLegacyRow(rec, columnMap);
    const res = parseRow(legacy, headerIdx + 1 + r + 1);
    if (res.ok) cleanRows.push(res.row);
  }
  return assembleFamilyGroups(cleanRows);
}

/** Mirror of the classifyGroup function in the modal. */
function classifyGroup(g: FamilyGroup): "ok" | "warnings" | "errors" | "duplicates" {
  if (g.errors.length > 0) return "errors";
  if (g.family_already_imported) return "duplicates";
  if (g.person_dedup_hits.length > 0 || g.rows.some((r) => r.warnings.length > 0)) {
    return "warnings";
  }
  return "ok";
}

/** Mirror of the familiasAImportar calculation in the modal. */
function calcFamiliasAImportar(
  groups: FamilyGroup[],
  skipWarnings: boolean,
  updateExisting: boolean
): number {
  const validFamilies = groups.filter((g) => classifyGroup(g) === "ok").length;
  const warningFamilies = groups.filter((g) => classifyGroup(g) === "warnings").length;
  const duplicateFamilies = groups.filter((g) => classifyGroup(g) === "duplicates").length;

  if (skipWarnings) {
    return validFamilies + (updateExisting ? duplicateFamilies : 0);
  }
  return validFamilies + warningFamilies + (updateExisting ? duplicateFamilies : 0);
}

/** Mirror of the excluded_family_numbers calculation in handleConfirm. */
function calcExcludedNumbers(groups: FamilyGroup[], skipWarnings: boolean): string[] | undefined {
  if (!skipWarnings) return undefined;
  return groups
    .filter((g) => {
      const tab = classifyGroup(g);
      return tab === "warnings" || tab === "duplicates";
    })
    .map((g) => g.legacy_numero_familia);
}

// ── Minimal FamilyGroup factory ──────────────────────────────────────────────

function makeOkGroup(num: string): FamilyGroup {
  return {
    legacy_numero_familia: num,
    rows: [],
    titular_index: 0,
    errors: [],
    person_dedup_hits: [],
    family_already_imported: false,
  };
}

function makeWarningGroup(num: string): FamilyGroup {
  return {
    legacy_numero_familia: num,
    rows: [
      {
        row_number: 1,
        legacy_numero_familia: num,
        is_titular: true,
        parentesco_original: null,
        fecha_alta: null,
        estado: "activa",
        relacion_db: "other",
        person: {
          nombre: "(sin nombre)",
          apellidos: "Apellido",
          fecha_nacimiento: null,
          genero: null,
          pais_origen: null,
          numero_documento: null,
          tipo_documento: null,
          telefono: null,
          email: null,
          direccion: null,
          municipio: null,
          codigo_postal: null,
          nivel_estudios: null,
          situacion_laboral: null,
          observaciones: null,
          metadata: {
            colectivos: [],
            legacy_row: 1,
          },
        },
        warnings: [{ field: "nombre", code: "nombre_placeholder", message: "Nombre vacío" }],
      },
    ],
    titular_index: 0,
    errors: [],
    person_dedup_hits: [],
    family_already_imported: false,
  };
}

function makeDuplicateGroup(num: string): FamilyGroup {
  return { ...makeOkGroup(num), family_already_imported: true };
}

function makeErrorGroup(num: string): FamilyGroup {
  return {
    ...makeOkGroup(num),
    errors: [{ field: "titular", message: "Error grave: sin titular" }],
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("classifyGroup", () => {
  it("classifies a clean family as 'ok'", () => {
    // Use 'Desempleado con Subsidio' — the only situacion_laboral value that
    // maps cleanly without a laboral_unknown warning in the current mapper.
    const csv = [
      FIXTURE_HEADER,
      '1,1030,30/09/2020,Luis,Apellido,M,604372950,Y-8206459-G,x,Perú,17/03/1983,,"C/ Test 17",28020,Madrid,,Educación Primaria,Desempleado con Subsidio,',
    ].join("\n");
    const groups = transformCsv(csv);
    expect(groups.length).toBe(1);
    // Verify no warnings were generated before asserting classification.
    expect(groups[0].rows[0].warnings).toHaveLength(0);
    expect(classifyGroup(groups[0])).toBe("ok");
  });

  it("classifies a family with group errors as 'errors'", () => {
    const csv = [
      FIXTURE_HEADER,
      // No titular (CABEZA DE FAMILIA = "Hermano")
      '1,1030,,X,Y,M,,,Hermano,Perú,17/03/1983,,,,,,,,',
    ].join("\n");
    const groups = transformCsv(csv);
    expect(groups.length).toBe(1);
    expect(classifyGroup(groups[0])).toBe("errors");
  });

  it("classifies a family with row warnings as 'warnings'", () => {
    const csv = [
      FIXTURE_HEADER,
      // Missing nombre → nombre_placeholder warning
      '1,1030,,,Apellidos,M,,,x,Perú,17/03/1983,,,,,,,,',
    ].join("\n");
    const groups = transformCsv(csv);
    expect(groups.length).toBe(1);
    expect(groups[0].rows[0].warnings.some((w) => w.code === "nombre_placeholder")).toBe(true);
    expect(classifyGroup(groups[0])).toBe("warnings");
  });

  it("classifies a family_already_imported=true group as 'duplicates'", () => {
    const csv = [
      FIXTURE_HEADER,
      '1,1030,30/09/2020,Luis,Apellido,M,,Y-8206459-G,x,Perú,17/03/1983,,,,,,,,',
    ].join("\n");
    const groups = transformCsv(csv);
    expect(groups.length).toBe(1);
    // Manually set family_already_imported to simulate a duplicate
    groups[0].family_already_imported = true;
    expect(classifyGroup(groups[0])).toBe("duplicates");
  });
});

describe("familiasAImportar calculation", () => {
  it("counts ok + warnings when skipWarnings=false, updateExisting=false", () => {
    const groups = [makeOkGroup("1"), makeWarningGroup("2"), makeDuplicateGroup("3"), makeErrorGroup("4")];
    // ok=1, warnings=1, duplicates=1 (omitted), errors=1 (blocked)
    expect(calcFamiliasAImportar(groups, false, false)).toBe(2);
  });

  it("counts only ok families when skipWarnings=true, updateExisting=false", () => {
    const groups = [makeOkGroup("1"), makeWarningGroup("2"), makeDuplicateGroup("3")];
    expect(calcFamiliasAImportar(groups, true, false)).toBe(1);
  });

  it("includes duplicates when skipWarnings=true AND updateExisting=true", () => {
    const groups = [makeOkGroup("1"), makeDuplicateGroup("3")];
    expect(calcFamiliasAImportar(groups, true, true)).toBe(2);
  });

  it("includes warnings + duplicates when skipWarnings=false AND updateExisting=true", () => {
    const groups = [makeOkGroup("1"), makeWarningGroup("2"), makeDuplicateGroup("3")];
    expect(calcFamiliasAImportar(groups, false, true)).toBe(3);
  });

  it("returns 0 when all families are errors", () => {
    const groups = [makeErrorGroup("1"), makeErrorGroup("2")];
    expect(calcFamiliasAImportar(groups, false, false)).toBe(0);
  });
});

describe("excluded_family_numbers calculation", () => {
  it("returns undefined when skipWarnings=false", () => {
    const groups = [makeOkGroup("1"), makeWarningGroup("2")];
    expect(calcExcludedNumbers(groups, false)).toBeUndefined();
  });

  it("returns warning + duplicate legacy numbers when skipWarnings=true", () => {
    const groups = [
      makeOkGroup("100"),
      makeWarningGroup("200"),
      makeDuplicateGroup("300"),
      makeErrorGroup("400"),
    ];
    const excluded = calcExcludedNumbers(groups, true);
    expect(excluded).toBeDefined();
    expect(excluded).toContain("200");
    expect(excluded).toContain("300");
    expect(excluded).not.toContain("100"); // ok — should NOT be excluded
    expect(excluded).not.toContain("400"); // error — already blocked, not excluded
  });

  it("returns empty array when all families are ok and skipWarnings=true", () => {
    const groups = [makeOkGroup("1")];
    const excluded = calcExcludedNumbers(groups, true);
    expect(excluded).toBeDefined();
    expect(excluded!.length).toBe(0);
  });

  it("excludes both warnings and duplicates but not ok or error families", () => {
    const groups = [
      makeOkGroup("OK1"),
      makeWarningGroup("WARN1"),
      makeWarningGroup("WARN2"),
      makeDuplicateGroup("DUP1"),
      makeErrorGroup("ERR1"),
    ];
    const excluded = calcExcludedNumbers(groups, true);
    expect(excluded!.sort()).toEqual(["DUP1", "WARN1", "WARN2"].sort());
  });
});

describe("confirmLegacyImport input schema — excluded_family_numbers", () => {
  // Minimal Zod schema mirroring the tRPC procedure input.
  const confirmInputSchema = z.object({
    preview_token: z.string().uuid(),
    src_filename: z.string().max(255).optional(),
    mode: z.enum(["skip", "update"]).default("skip"),
    excluded_family_numbers: z.array(z.string()).optional(),
  });

  it("accepts input without excluded_family_numbers (backwards compatible)", () => {
    const result = confirmInputSchema.safeParse({
      preview_token: "550e8400-e29b-41d4-a716-446655440000",
      mode: "skip",
    });
    expect(result.success).toBe(true);
    expect(result.data?.excluded_family_numbers).toBeUndefined();
  });

  it("accepts input with excluded_family_numbers as string array", () => {
    const result = confirmInputSchema.safeParse({
      preview_token: "550e8400-e29b-41d4-a716-446655440000",
      mode: "skip",
      excluded_family_numbers: ["100", "200", "300"],
    });
    expect(result.success).toBe(true);
    expect(result.data?.excluded_family_numbers).toEqual(["100", "200", "300"]);
  });

  it("accepts empty excluded_family_numbers array", () => {
    const result = confirmInputSchema.safeParse({
      preview_token: "550e8400-e29b-41d4-a716-446655440000",
      mode: "update",
      excluded_family_numbers: [],
    });
    expect(result.success).toBe(true);
    expect(result.data?.excluded_family_numbers).toEqual([]);
  });

  it("rejects non-string items in excluded_family_numbers", () => {
    const result = confirmInputSchema.safeParse({
      preview_token: "550e8400-e29b-41d4-a716-446655440000",
      mode: "skip",
      excluded_family_numbers: [100, 200], // numbers, not strings
    });
    expect(result.success).toBe(false);
  });
});
