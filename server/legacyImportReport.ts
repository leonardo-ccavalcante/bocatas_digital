/**
 * legacyImportReport.ts — generates an Excel workbook from a legacy import
 * preview's groups, surfacing warnings and errors in a format that operators
 * can use to correct the source CSV before re-uploading.
 *
 * Exported: generateWarningsReport(groups) → Buffer (xlsx)
 */
import ExcelJS from "exceljs";
import type { FamilyGroup } from "../shared/legacyFamiliasTypes";

// ── Color palette ─────────────────────────────────────────────────────────────
const COLOR = {
  headerBg: "FF1A237E",
  headerFg: "FFFFFFFF",
  warnBg: "FFFFF3E0",
  warnFg: "FFE65100",
  errorBg: "FFFFEBEE",
  errorFg: "FFB71C1C",
  okBg: "FFE8F5E9",
  okFg: "FF1B5E20",
  sectionBg: "FFE8EAF6",
  sectionFg: "FF1A237E",
  border: "FFDDDDDD",
} as const;

function applyHeaderRow(row: ExcelJS.Row, values: string[]) {
  row.values = ["", ...values]; // col A is blank (indent)
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
  opts: { warnColor?: boolean; errorColor?: boolean } = {}
) {
  row.values = ["", ...values];
  row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    if (colNumber === 1) return;
    if (opts.errorColor) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.errorBg } };
      cell.font = { color: { argb: COLOR.errorFg }, size: 10 };
    } else if (opts.warnColor) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.warnBg } };
      cell.font = { color: { argb: COLOR.warnFg }, size: 10 };
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

// ── Correction guide per warning code ────────────────────────────────────────
const CORRECTION_GUIDE: Record<string, string> = {
  date_ambiguous:
    "Cambiar el año a 4 dígitos. Ej: '15/03/85' → '15/03/1985'. Verificar que el siglo sea correcto.",
  date_invalid:
    "La fecha no pudo interpretarse. Usar formato dd/mm/yyyy con año de 4 dígitos.",
  parentesco_coerced:
    "Reemplazar por un valor estándar: Esposo/a, Hijo/a, Hermano/a, Padre, Madre, Abuelo/a, Nieto/a, Tío/a, Sobrino/a, Cónyuge, Pareja.",
  nombre_placeholder:
    "Completar con el nombre real del miembro, o dejar en blanco si no se conoce.",
  cp_invalid:
    "Usar 5 dígitos sin puntos ni espacios. Ej: 28012.",
  pais_unknown:
    "Usar código ISO-2 del país. Ej: ES, PE, VE, CO, EC, BO, MX.",
  doc_format:
    "Revisar el formato del documento. NIE: X1234567A. DNI: 12345678A. Pasaporte: alfanumérico.",
};

function correctionFor(code: string, message: string): string {
  return CORRECTION_GUIDE[code] ?? `Revisar el campo indicado: ${message}`;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateWarningsReport(groups: FamilyGroup[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Bocatas Digital";
  wb.created = new Date();

  // ── Sheet 1: Instrucciones ────────────────────────────────────────────────
  const wsI = wb.addWorksheet("Instrucciones");
  wsI.views = [{ showGridLines: false }];
  wsI.columns = [
    { key: "a", width: 4 },
    { key: "b", width: 24 },
    { key: "c", width: 70 },
  ];

  const titleRow = wsI.addRow(["", "REPORTE DE ADVERTENCIAS Y ERRORES — BOCATAS DIGITAL", ""]);
  wsI.mergeCells(`B${titleRow.number}:C${titleRow.number}`);
  titleRow.getCell("B").fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.headerBg } };
  titleRow.getCell("B").font = { bold: true, size: 13, color: { argb: COLOR.headerFg } };
  titleRow.getCell("B").alignment = { horizontal: "center", vertical: "middle" };
  titleRow.height = 36;

  const subtitleRow = wsI.addRow(["", "Generado automáticamente. Corrige el CSV y vuelve a subirlo.", ""]);
  wsI.mergeCells(`B${subtitleRow.number}:C${subtitleRow.number}`);
  subtitleRow.getCell("B").font = { italic: true, size: 10, color: { argb: "FF555555" } };
  subtitleRow.height = 22;

  wsI.addRow([]);

  const sections: Array<[string, string]> = [
    ["Hoja: Resumen", "Totales por categoría y guía de corrección para cada tipo de advertencia."],
    ["Hoja: Advertencias", "Lista de todas las advertencias. Los datos SE IMPORTARÁN con ajustes automáticos, pero se recomienda corregirlos en el CSV para mayor precisión."],
    ["Hoja: Errores", "Familias que NO se importarán hasta que se corrija el error indicado. ACCIÓN OBLIGATORIA."],
    ["Paso 1", "Abre el CSV original en Excel o Google Sheets."],
    ["Paso 2", "Localiza la familia por su Nº y el miembro por la columna 'Fila CSV' (número de fila en el archivo original)."],
    ["Paso 3", "Lee la columna '✏ Acción requerida' y aplica la corrección en el campo indicado."],
    ["Paso 4", "Guarda el CSV corregido y vuelve a subirlo en la plataforma."],
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
    { key: "b", width: 26 },
    { key: "c", width: 12 },
    { key: "d", width: 60 },
  ];

  applyHeaderRow(wsS.addRow([]), ["Categoría", "Cantidad", "Acción requerida"]);

  const warningGroups = groups.filter(
    (g) => g.errors.length === 0 && !g.family_already_imported && g.rows.some((r) => r.warnings.length > 0)
  );
  const errorGroups = groups.filter((g) => g.errors.length > 0);
  const okGroups = groups.filter(
    (g) =>
      g.errors.length === 0 &&
      !g.family_already_imported &&
      !g.rows.some((r) => r.warnings.length > 0)
  );
  const dupGroups = groups.filter((g) => g.family_already_imported);

  const totalWarnings = warningGroups.reduce((acc, g) => acc + g.rows.reduce((a, r) => a + r.warnings.length, 0), 0);

  const summaryData: Array<[string, number, string, boolean, boolean]> = [
    ["✅ Familias OK", okGroups.length, "Se importarán sin cambios.", false, false],
    ["⚠ Familias con advertencias", warningGroups.length, "Se importarán con ajustes automáticos. Ver hoja Advertencias.", true, false],
    ["❌ Familias con errores", errorGroups.length, "NO se importarán. Corregir antes de volver a subir. Ver hoja Errores.", false, true],
    ["🔁 Familias duplicadas", dupGroups.length, "Ya importadas. Se omiten (o actualizan si el toggle está activo).", false, false],
    ["Total advertencias (filas)", totalWarnings, "Número de avisos individuales en la hoja Advertencias.", true, false],
  ];

  for (const [label, count, action, isWarn, isError] of summaryData) {
    applyDataRow(wsS.addRow([]), [label, count, action], { warnColor: isWarn, errorColor: isError });
  }

  wsS.addRow([]);
  applyHeaderRow(wsS.addRow([]), ["Código de advertencia", "Descripción", "Cómo corregir en el CSV"]);

  const guideEntries: Array<[string, string]> = [
    ["date_ambiguous", "Año de 2 dígitos (ambiguo). El sistema interpretó el siglo automáticamente."],
    ["date_invalid", "Fecha de nacimiento no reconocida o en formato incorrecto."],
    ["parentesco_coerced", "Parentesco no estándar. Se importa como 'other'."],
    ["nombre_placeholder", "Nombre vacío o valor genérico."],
    ["cp_invalid", "Código postal con formato incorrecto."],
    ["pais_unknown", "Código de país no reconocido."],
    ["doc_format", "Formato de documento (DNI/NIE/Pasaporte) incorrecto."],
  ];

  for (const [code, desc] of guideEntries) {
    const r = wsS.addRow(["", code, desc, CORRECTION_GUIDE[code] ?? "—"]);
    r.getCell("B").font = { bold: true, size: 10, color: { argb: COLOR.warnFg } };
    r.getCell("C").font = { size: 10 };
    r.getCell("D").font = { size: 10 };
    r.getCell("C").alignment = { wrapText: true, vertical: "top" };
    r.getCell("D").alignment = { wrapText: true, vertical: "top" };
    r.height = 36;
  }

  // ── Sheet 3: Advertencias ─────────────────────────────────────────────────
  const wsW = wb.addWorksheet("Advertencias");
  wsW.views = [{ showGridLines: false }];
  wsW.columns = [
    { key: "a", width: 4 },
    { key: "b", width: 10 },  // Nº Familia
    { key: "c", width: 28 },  // Titular
    { key: "d", width: 8 },   // Fila CSV
    { key: "e", width: 22 },  // Nombre miembro
    { key: "f", width: 14 },  // Rol/Parentesco
    { key: "g", width: 14 },  // Código advertencia
    { key: "h", width: 42 },  // Mensaje
    { key: "i", width: 60 },  // Acción requerida
  ];

  applyHeaderRow(wsW.addRow([]), [
    "Nº Familia", "Titular", "Fila CSV", "Nombre miembro", "Rol/Parentesco",
    "Código", "Mensaje del sistema", "✏ Acción requerida en el CSV",
  ]);
  wsW.getRow(1).height = 24;

  let warnRowCount = 0;
  for (const g of warningGroups) {
    const titular = g.rows[g.titular_index];
    const titularName = titular
      ? `${titular.person.nombre} ${titular.person.apellidos}`.trim()
      : "(sin titular)";

    for (const row of g.rows) {
      for (const w of row.warnings) {
        applyDataRow(
          wsW.addRow([]),
          [
            g.legacy_numero_familia,
            titularName,
            row.row_number,
            `${row.person.nombre} ${row.person.apellidos}`.trim(),
            row.is_titular ? "titular" : (row.parentesco_original ?? "—"),
            w.code ?? "—",
            w.message,
            correctionFor(w.code ?? "", w.message),
          ],
          { warnColor: true }
        );
        warnRowCount++;
      }
    }
  }

  if (warnRowCount === 0) {
    const r = wsW.addRow(["", "No hay advertencias en este preview.", "", "", "", "", "", ""]);
    r.getCell("B").font = { italic: true, size: 10, color: { argb: "FF888888" } };
    wsW.mergeCells(`B${r.number}:I${r.number}`);
  }

  // ── Sheet 4: Errores ──────────────────────────────────────────────────────
  const wsE = wb.addWorksheet("Errores");
  wsE.views = [{ showGridLines: false }];
  wsE.columns = [
    { key: "a", width: 4 },
    { key: "b", width: 10 },  // Nº Familia
    { key: "c", width: 28 },  // Titular
    { key: "d", width: 8 },   // Fila CSV
    { key: "e", width: 22 },  // Nombre miembro
    { key: "f", width: 14 },  // Rol
    { key: "g", width: 14 },  // Código
    { key: "h", width: 42 },  // Mensaje
    { key: "i", width: 60 },  // Acción requerida
  ];

  applyHeaderRow(wsE.addRow([]), [
    "Nº Familia", "Titular", "Fila CSV", "Nombre miembro", "Rol/Parentesco",
    "Código", "Mensaje del sistema", "✏ Acción requerida en el CSV",
  ]);

  let errRowCount = 0;
  for (const g of errorGroups) {
    const titular = g.rows[g.titular_index];
    const titularName = titular
      ? `${titular.person.nombre} ${titular.person.apellidos}`.trim()
      : "(sin titular)";

    // Group-level errors
    for (const e of g.errors) {
      const eField = e.field;
      applyDataRow(
        wsE.addRow([]),
        [
          g.legacy_numero_familia,
          titularName,
          "—",
          "(grupo completo)",
          "—",
          eField,
          e.message,
          eField === "no_titular"
            ? "Poner 'x' en la columna CABEZA DE FAMILIA para la fila del titular de esta familia."
            : eField === "multiple_titulares"
            ? "Dejar solo un 'x' en CABEZA DE FAMILIA y eliminar los demás."
            : `Corregir el error indicado en las filas de la familia #${g.legacy_numero_familia}.`,
        ],
        { errorColor: true }
      );
      errRowCount++;
    }

    // Row-level errors (if any)
    for (const row of g.rows) {
      for (const w of row.warnings) {
        applyDataRow(
          wsE.addRow([]),
          [
            g.legacy_numero_familia,
            titularName,
            row.row_number,
            `${row.person.nombre} ${row.person.apellidos}`.trim(),
            row.is_titular ? "titular" : (row.parentesco_original ?? "—"),
            w.code ?? "—",
            w.message,
            correctionFor(w.code ?? "", w.message),
          ],
          { errorColor: true }
        );
        errRowCount++;
      }
    }
  }

  if (errRowCount === 0) {
    const r = wsE.addRow(["", "No hay errores en este preview.", "", "", "", "", "", ""]);
    r.getCell("B").font = { italic: true, size: 10, color: { argb: "FF888888" } };
    wsE.mergeCells(`B${r.number}:I${r.number}`);
  }

  // ── Freeze header rows ────────────────────────────────────────────────────
  for (const ws of [wsW, wsE]) {
    ws.views = [{ state: "frozen", ySplit: 1, showGridLines: false }];
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
