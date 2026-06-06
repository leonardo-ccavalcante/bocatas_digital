/**
 * informesImportReport.ts — generates an Excel workbook from an Informes Sociales
 * enrichment preview, surfacing families with warnings (ambiguous member matches,
 * missing narratives, etc.) so operators can review before confirming.
 *
 * Exported: generateInformesWarningsReport(families) → Buffer (xlsx)
 */
import ExcelJS from "exceljs";
import type { InformesFamily } from "../shared/legacyFamiliasTypes";

// ── Color palette (mirrors legacyImportReport.ts) ─────────────────────────────
const COLOR = {
  headerBg: "FF1A237E",
  headerFg: "FFFFFFFF",
  warnBg: "FFFFF3E0",
  warnFg: "FFE65100",
  okBg: "FFE8F5E9",
  okFg: "FF1B5E20",
  missingBg: "FFFCE4EC",
  missingFg: "FF880E4F",
  sectionBg: "FFE8EAF6",
  sectionFg: "FF1A237E",
  border: "FFDDDDDD",
} as const;

function applyHeaderRow(row: ExcelJS.Row, values: string[]) {
  row.values = ["", ...values];
  row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    if (colNumber === 1) return;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.headerBg } };
    cell.font = { bold: true, color: { argb: COLOR.headerFg }, size: 10 };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = {
      bottom: { style: "thin", color: { argb: COLOR.border } },
      right: { style: "thin", color: { argb: COLOR.border } },
    };
  });
  row.height = 22;
}

function applyDataRow(
  row: ExcelJS.Row,
  values: (string | number | null)[],
  opts: { warnColor?: boolean; missingColor?: boolean; okColor?: boolean } = {}
) {
  row.values = ["", ...values];
  row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    if (colNumber === 1) return;
    if (opts.missingColor) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.missingBg } };
      cell.font = { color: { argb: COLOR.missingFg }, size: 10 };
    } else if (opts.warnColor) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.warnBg } };
      cell.font = { color: { argb: COLOR.warnFg }, size: 10 };
    } else if (opts.okColor) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.okBg } };
      cell.font = { color: { argb: COLOR.okFg }, size: 10 };
    } else {
      cell.font = { size: 10 };
    }
    cell.alignment = { vertical: "top", wrapText: true };
    cell.border = {
      bottom: { style: "thin", color: { argb: COLOR.border } },
      right: { style: "thin", color: { argb: COLOR.border } },
    };
  });
  row.height = 30;
}

// ── Classify a family for the report ─────────────────────────────────────────
type FamilyCategory = "warnings" | "missing" | "ok";

function classifyFamily(f: InformesFamily): FamilyCategory {
  if (f.family_id === null) return "missing";
  const hasWarning = f.member_matches.some(
    (m) => m.match_tier === "ambiguous" || m.match_tier === "member_conflict"
  );
  return hasWarning ? "warnings" : "ok";
}

function titularName(f: InformesFamily): string {
  return `${f.titular.nombre ?? ""} ${f.titular.apellidos ?? ""}`.trim() || "(sin titular)";
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateInformesWarningsReport(
  families: InformesFamily[],
  srcFilename?: string | null
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Bocatas Digital";
  wb.created = new Date();

  const warningFamilies = families.filter((f) => classifyFamily(f) === "warnings");
  const missingFamilies = families.filter((f) => classifyFamily(f) === "missing");
  const okFamilies = families.filter((f) => classifyFamily(f) === "ok");

  // ── Sheet 1: Instrucciones ────────────────────────────────────────────────
  const wsI = wb.addWorksheet("Instrucciones");
  wsI.views = [{ showGridLines: false }];
  wsI.columns = [
    { key: "a", width: 4 },
    { key: "b", width: 28 },
    { key: "c", width: 70 },
  ];

  const titleRow = wsI.addRow(["", "REPORTE INFORMES SOCIALES — BOCATAS DIGITAL", ""]);
  wsI.mergeCells(`B${titleRow.number}:C${titleRow.number}`);
  titleRow.getCell("B").fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.headerBg } };
  titleRow.getCell("B").font = { bold: true, size: 13, color: { argb: COLOR.headerFg } };
  titleRow.getCell("B").alignment = { horizontal: "center", vertical: "middle" };
  titleRow.height = 36;

  const subtitleRow = wsI.addRow(["", `Archivo: ${srcFilename ?? "—"} · Generado: ${new Date().toLocaleString("es-ES")}`, ""]);
  wsI.mergeCells(`B${subtitleRow.number}:C${subtitleRow.number}`);
  subtitleRow.getCell("B").font = { italic: true, size: 10, color: { argb: "FF555555" } };
  subtitleRow.height = 22;

  wsI.addRow([]);

  const sections: Array<[string, string]> = [
    ["Hoja: Resumen", "Totales por categoría y explicación de cada tipo de aviso."],
    ["Hoja: Con avisos", "Familias encontradas en el padrón pero con miembros ambiguos o en conflicto. Revisar antes de confirmar."],
    ["Hoja: No encontradas", "Familias del CSV de informes que no existen en el padrón. INFORMES nunca crea familias: importarlas primero desde el Padrón."],
    ["Paso 1", "Revisa la hoja 'Con avisos': para cada familia, verifica los miembros marcados como ambiguos o en conflicto."],
    ["Paso 2", "Si el emparejamiento es incorrecto, corrige el CSV de informes (nombre/apellidos/DNI del miembro) y vuelve a subirlo."],
    ["Paso 3", "Las familias 'No encontradas' deben importarse primero desde el Padrón (otra pestaña del modal)."],
    ["Paso 4", "Una vez revisado, confirma el enriquecimiento. Las familias con avisos se enriquecerán igualmente."],
  ];

  for (const [label, text] of sections) {
    const r = wsI.addRow(["", label, text]);
    r.getCell("B").font = { bold: true, size: 10 };
    r.getCell("B").fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.sectionBg } };
    r.getCell("B").alignment = { vertical: "top", wrapText: true };
    r.getCell("C").font = { size: 10 };
    r.getCell("C").alignment = { vertical: "top", wrapText: true };
    r.height = 36;
  }

  // ── Sheet 2: Resumen ──────────────────────────────────────────────────────
  const wsS = wb.addWorksheet("Resumen");
  wsS.views = [{ showGridLines: false }];
  wsS.columns = [
    { key: "a", width: 4 },
    { key: "b", width: 30 },
    { key: "c", width: 12 },
    { key: "d", width: 60 },
  ];

  applyHeaderRow(wsS.addRow([]), ["Categoría", "Cantidad", "Acción requerida"]);

  const summaryData: Array<[string, number, string, boolean, boolean, boolean]> = [
    ["✅ Para enriquecer (OK)", okFamilies.length, "Se enriquecerán sin cambios.", false, false, true],
    ["⚠ Con avisos (miembros ambiguos)", warningFamilies.length, "Se enriquecerán pero revisar emparejamiento. Ver hoja 'Con avisos'.", true, false, false],
    ["❓ No encontradas en el padrón", missingFamilies.length, "No se enriquecerán. Importar primero desde el Padrón. Ver hoja 'No encontradas'.", false, true, false],
    ["Total familias en el CSV", families.length, "Total de familias procesadas.", false, false, false],
  ];

  for (const [label, count, action, isWarn, isMissing, isOk] of summaryData) {
    applyDataRow(wsS.addRow([]), [label, count, action], {
      warnColor: isWarn,
      missingColor: isMissing,
      okColor: isOk,
    });
  }

  // ── Sheet 3: Con avisos ───────────────────────────────────────────────────
  const wsW = wb.addWorksheet("Con avisos");
  wsW.views = [{ showGridLines: false }];
  wsW.columns = [
    { key: "a", width: 4 },
    { key: "b", width: 10 },  // Nº Familia
    { key: "c", width: 30 },  // Titular
    { key: "d", width: 22 },  // Nombre miembro
    { key: "e", width: 14 },  // Tipo match
    { key: "f", width: 50 },  // Acción sugerida
  ];

  applyHeaderRow(wsW.addRow([]), [
    "Nº Familia", "Titular", "Miembro con aviso", "Tipo de aviso", "Acción sugerida",
  ]);

  let warnRowCount = 0;
  for (const f of warningFamilies) {
    const name = titularName(f);
    // Build a slot→member lookup for name resolution
    const memberBySlot = new Map(f.members.map((mem) => [mem.slot, mem]));
    for (const m of f.member_matches) {
      if (m.match_tier !== "ambiguous" && m.match_tier !== "member_conflict") continue;
      const mem = memberBySlot.get(m.slot);
      const memberName = mem
        ? `${mem.nombre} ${mem.apellidos ?? ""}`.trim()
        : `(slot ${m.slot})`;
      const action =
        m.match_tier === "member_conflict"
          ? "Conflicto de DOB o DNI con el padrón. Verificar fecha de nacimiento y documento."
          : "Múltiples candidatos posibles. Verificar nombre completo y DNI del miembro.";
      applyDataRow(
        wsW.addRow([]),
        [f.legacy_numero_familia, name, memberName, m.match_tier, action],
        { warnColor: true }
      );
      warnRowCount++;
    }
  }

  if (warnRowCount === 0) {
    const r = wsW.addRow(["", "No hay familias con avisos en este archivo.", "", "", "", ""]);
    r.getCell("B").font = { italic: true, size: 10, color: { argb: "FF888888" } };
    wsW.mergeCells(`B${r.number}:F${r.number}`);
  }

  // ── Sheet 4: No encontradas ───────────────────────────────────────────────
  const wsM = wb.addWorksheet("No encontradas");
  wsM.views = [{ showGridLines: false }];
  wsM.columns = [
    { key: "a", width: 4 },
    { key: "b", width: 10 },  // Nº Familia
    { key: "c", width: 30 },  // Titular
    { key: "d", width: 60 },  // Acción requerida
  ];

  applyHeaderRow(wsM.addRow([]), ["Nº Familia", "Titular en el CSV", "Acción requerida"]);

  if (missingFamilies.length === 0) {
    const r = wsM.addRow(["", "Todas las familias del CSV fueron encontradas en el padrón.", "", ""]);
    r.getCell("B").font = { italic: true, size: 10, color: { argb: "FF888888" } };
    wsM.mergeCells(`B${r.number}:D${r.number}`);
  } else {
    for (const f of missingFamilies) {
      applyDataRow(
        wsM.addRow([]),
        [
          f.legacy_numero_familia,
          titularName(f),
          "Familia no encontrada en el padrón. Importarla primero desde la pestaña 'Padrón (familias)' del modal de importación.",
        ],
        { missingColor: true }
      );
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
