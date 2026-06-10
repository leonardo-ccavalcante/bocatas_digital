/**
 * pdfFromDocxPureNode.ts
 *
 * Pure Node.js PDF generation for Derivar Hoja.
 * Does NOT require LibreOffice — uses pdfkit to render a visual layout
 * that mirrors the reference document (Bocatas + Comunidad de Madrid logos,
 * red table header, RGPD clause).
 *
 * Primary export: renderDerivarHojaPdf(data, logos?) → Buffer
 * Legacy export:  convertDocxToPdfPureNode(docxBuf, options?) → Buffer
 *
 * FIX (Batch 20):
 * - Removed `lineBreak: false` + `ellipsis: true` which truncated cell text.
 * - Added dynamic row height calculation so long descriptions wrap properly.
 * - Ensured RGPD clause always fits on the same page (force new page if needed).
 * - Increased column widths for Descripción and Recurso.
 */

import PDFDocument from "pdfkit";
import PizZip from "pizzip";
import type { DerivarHojaTemplateData, DerivarLogoOptions } from "./docxRender";

// ── Color palette ─────────────────────────────────────────────────────────────
const COLOR_RED = "#C0392B";
const COLOR_RED_TITLE = "#8B0000";
const COLOR_WHITE = "#FFFFFF";
const COLOR_DARK = "#1A1A1A";
const COLOR_GRAY = "#555555";
const COLOR_LIGHT_GRAY = "#AAAAAA";
const COLOR_ROW_ALT = "#F5F5F5";

// ── Page layout (A4 = 595.28 x 841.89 pt) ────────────────────────────────────
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_H = 36; // horizontal margin (reduced from 45 to give more table space)
const MARGIN_TOP = 40;
const MARGIN_BOTTOM = 45;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_H * 2;

// ── Table column widths ───────────────────────────────────────────────────────
// 6 columns: Fecha | Tipo | Descripción | Recurso | Observaciones | Firma
// FIX: Increased Descripción and Recurso columns, reduced Firma (it's blank anyway)
const COL_FECHA = 52;
const COL_TIPO = 72;
const COL_DESC = 130;   // was 110 — most text goes here
const COL_RECURSO = 120; // was 110
const COL_OBS = 80;
const COL_FIRMA = CONTENT_WIDTH - COL_FECHA - COL_TIPO - COL_DESC - COL_RECURSO - COL_OBS;
const COL_WIDTHS = [COL_FECHA, COL_TIPO, COL_DESC, COL_RECURSO, COL_OBS, COL_FIRMA];
const TABLE_HEADERS = [
  "Fecha",
  "Tipo de\nintervención",
  "Descripción de la\nactuación realizada",
  "Recurso al que\nse deriva",
  "Observaciones",
  "Firma",
];

// ── Official RGPD clause ──────────────────────────────────────────────────────
const RGPD_TITLE = "CLÁUSULA DE PROTECCIÓN DE DATOS";
const RGPD_TEXT =
  "De conformidad con el Reglamento (UE) 2016/679 de Protección de Datos (RGPD), se informa que los datos " +
  "recogidos en este documento serán tratados por Asociación/Fundación Pasión por el Hombre–Bocatas con la " +
  "finalidad de gestionar el seguimiento de las intervenciones sociales. Las personas interesadas podrán " +
  "ejercer sus derechos dirigiéndose a bocatas@bocatas.io.";

const TABLE_NOTE =
  "Añadir nuevas filas según sea necesario durante el año. Cuando se añade un nuevo registro volver a imprimir y firmar las anteriores.";

// ── Font size constants ───────────────────────────────────────────────────────
const FONT_TABLE = 7;
const CELL_PADDING = 3;
const MIN_ROW_H = 18;

// ── Public API ────────────────────────────────────────────────────────────────

export interface PdfFromDocxOptions {
  title?: string;
  fontSize?: number;
  paragraphGap?: number;
}

/**
 * Estimates the height needed for a text string in a given column width.
 * Uses a rough character-per-line estimate based on font size.
 */
function estimateTextHeight(text: string, colWidth: number, fontSize: number): number {
  if (!text || !text.trim()) return MIN_ROW_H;
  // Approximate characters per line at this font size and column width
  // pdfkit uses ~0.55 * fontSize as average char width for Helvetica
  const charsPerLine = Math.max(1, Math.floor((colWidth - CELL_PADDING * 2) / (fontSize * 0.55)));
  const lines = text.split("\n").reduce((acc, line) => {
    return acc + Math.max(1, Math.ceil(line.length / charsPerLine));
  }, 0);
  return Math.max(MIN_ROW_H, lines * (fontSize + 2) + CELL_PADDING * 2);
}

/**
 * Renders a Derivar Hoja as a styled PDF using pdfkit.
 * Mirrors the visual layout of the reference document.
 * Fits in a single A4 page for typical use (≤ 10 interventions).
 */
export async function renderDerivarHojaPdf(
  data: DerivarHojaTemplateData,
  logos?: DerivarLogoOptions,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: MARGIN_TOP, bottom: MARGIN_BOTTOM, left: MARGIN_H, right: MARGIN_H },
      info: {
        Title: `Hoja de Derivaciones — ${data.nombre}`,
        Author: "Bocatas Digital",
        Creator: "Bocatas Digital — renderDerivarHojaPdf",
      },
      autoFirstPage: true,
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // ── Header: logos ─────────────────────────────────────────────────────────
    const LOGO_H = 48;
    const LOGO_W = 48;

    if (logos?.bocatasLogo && logos.bocatasLogo.length > 0) {
      try {
        doc.image(logos.bocatasLogo, MARGIN_H, MARGIN_TOP, {
          fit: [LOGO_W, LOGO_H],
        });
      } catch {
        // skip
      }
    }

    if (logos?.secondaryLogo && logos.secondaryLogo.length > 0) {
      try {
        doc.image(logos.secondaryLogo, PAGE_WIDTH - MARGIN_H - LOGO_W, MARGIN_TOP, {
          fit: [LOGO_W, LOGO_H],
        });
      } catch {
        // skip
      }
    }

    // ── Subtitle ──────────────────────────────────────────────────────────────
    let y = MARGIN_TOP + LOGO_H + 8;
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(COLOR_DARK)
      .text("ASOCIACIÓN PASIÓN POR EL HOMBRE – BOCATAS", MARGIN_H, y, {
        width: CONTENT_WIDTH,
        align: "center",
      });
    y += 14;

    // ── Title ─────────────────────────────────────────────────────────────────
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor(COLOR_RED_TITLE)
      .text("HOJA DE REGISTRO DE DERIVACIONES E INTERVENCIONES", MARGIN_H, y, {
        width: CONTENT_WIDTH,
        align: "center",
        underline: true,
      });
    y += 18;

    // ── Section 1 header ──────────────────────────────────────────────────────
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(COLOR_DARK)
      .text("1. DATOS DE LA PERSONA / FAMILIA ATENDIDA", MARGIN_H, y);
    y += 13;

    // ── Patient info fields ───────────────────────────────────────────────────
    const LABEL_W = 170;
    const infoRows: [string, string][] = [
      ["Nombre y apellidos:", data.nombre],
      ["Nº Unidad familiar:", data.numUnidadFamiliar],
      ["Programa de referencia:", data.programaReferencia],
      ["Profesional de referencia:", data.profesionalReferencia],
      ["Fecha de apertura del registro:", data.fechaApertura],
    ];

    for (const [label, value] of infoRows) {
      doc
        .font("Helvetica-Bold")
        .fontSize(8.5)
        .fillColor(COLOR_DARK)
        .text(label, MARGIN_H, y, { continued: true, width: LABEL_W });
      doc
        .font("Helvetica")
        .fontSize(8.5)
        .fillColor(COLOR_DARK)
        .text(` ${value}`, { width: CONTENT_WIDTH - LABEL_W });
      y += 13;
    }

    y += 6;

    // ── Section 2 header ──────────────────────────────────────────────────────
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(COLOR_DARK)
      .text("2. TABLA DE REGISTRO DE INTERVENCIONES Y DERIVACIONES", MARGIN_H, y);
    y += 12;

    // ── Table ─────────────────────────────────────────────────────────────────
    const HEADER_H = 26;

    // Helper: draw table header at position y
    const drawTableHeader = (atY: number) => {
      doc.rect(MARGIN_H, atY, CONTENT_WIDTH, HEADER_H).fill(COLOR_RED);
      let x = MARGIN_H;
      for (let i = 0; i < TABLE_HEADERS.length; i++) {
        doc
          .font("Helvetica-Bold")
          .fontSize(FONT_TABLE)
          .fillColor(COLOR_WHITE)
          .text(TABLE_HEADERS[i], x + CELL_PADDING, atY + CELL_PADDING, {
            width: COL_WIDTHS[i] - CELL_PADDING * 2,
            align: "center",
            lineBreak: true,
          });
        x += COL_WIDTHS[i];
      }
    };

    drawTableHeader(y);
    const tableStartY = y;
    y += HEADER_H;

    // Table rows
    if (data.intervenciones.length === 0) {
      doc
        .font("Helvetica")
        .fontSize(FONT_TABLE)
        .fillColor(COLOR_LIGHT_GRAY)
        .text("Sin intervenciones registradas", MARGIN_H + 4, y + 6, {
          width: CONTENT_WIDTH - 8,
          align: "center",
        });
      y += MIN_ROW_H;
    } else {
      for (let rowIdx = 0; rowIdx < data.intervenciones.length; rowIdx++) {
        const interv = data.intervenciones[rowIdx];

        const recursoText = [
          interv.recursoNombre ?? "",
          interv.recursoDireccion ?? "",
          interv.recursoTelefono ? `Tel. ${interv.recursoTelefono}` : "",
        ]
          .filter(Boolean)
          .join("\n");

        const cells = [
          interv.fecha,
          interv.tipo,
          interv.descripcion,
          recursoText,
          interv.observaciones ?? "",
          interv.firmaPlaceholder ?? "",
        ];

        // FIX: Calculate dynamic row height based on actual content
        const rowH = Math.max(
          MIN_ROW_H,
          ...cells.map((cell, i) =>
            estimateTextHeight(cell ?? "", COL_WIDTHS[i], FONT_TABLE),
          ),
        );

        // New page if needed — reserve space for RGPD (≈ 55pt)
        const RGPD_RESERVE = 60;
        if (y + rowH > PAGE_HEIGHT - MARGIN_BOTTOM - RGPD_RESERVE) {
          doc.addPage();
          y = MARGIN_TOP;
          drawTableHeader(y);
          y += HEADER_H;
        }

        // Alternating row background
        if (rowIdx % 2 === 1) {
          doc.rect(MARGIN_H, y, CONTENT_WIDTH, rowH).fill(COLOR_ROW_ALT);
        }

        let x = MARGIN_H;
        for (let i = 0; i < cells.length; i++) {
          // FIX: Use lineBreak: true so text wraps instead of being truncated
          doc
            .font("Helvetica")
            .fontSize(FONT_TABLE)
            .fillColor(COLOR_DARK)
            .text(cells[i] ?? "", x + CELL_PADDING, y + CELL_PADDING, {
              width: COL_WIDTHS[i] - CELL_PADDING * 2,
              lineBreak: true,
              height: rowH - CELL_PADDING * 2,
            });
          x += COL_WIDTHS[i];
        }

        // Row bottom border
        doc
          .moveTo(MARGIN_H, y + rowH)
          .lineTo(MARGIN_H + CONTENT_WIDTH, y + rowH)
          .strokeColor("#DDDDDD")
          .lineWidth(0.3)
          .stroke();

        y += rowH;
      }
    }

    // Table outer border
    doc
      .rect(MARGIN_H, tableStartY, CONTENT_WIDTH, y - tableStartY)
      .strokeColor(COLOR_RED)
      .lineWidth(0.5)
      .stroke();

    y += 5;

    // ── Table note ────────────────────────────────────────────────────────────
    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor(COLOR_GRAY)
      .text(TABLE_NOTE, MARGIN_H, y, { width: CONTENT_WIDTH });
    y += 18;

    // ── RGPD clause — ensure it fits on the current page ─────────────────────
    const RGPD_HEIGHT = 45; // approximate height for RGPD block
    if (y + RGPD_HEIGHT > PAGE_HEIGHT - MARGIN_BOTTOM) {
      doc.addPage();
      y = MARGIN_TOP;
    }

    doc
      .font("Helvetica-Bold")
      .fontSize(7)
      .fillColor(COLOR_DARK)
      .text(RGPD_TITLE, MARGIN_H, y, { width: CONTENT_WIDTH });
    y += 10;

    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor(COLOR_DARK)
      .text(RGPD_TEXT, MARGIN_H, y, { width: CONTENT_WIDTH, align: "justify" });

    doc.end();
  });
}

// ── Legacy fallback ───────────────────────────────────────────────────────────

/**
 * @deprecated Use renderDerivarHojaPdf(data, logos) for visual output.
 */
export async function convertDocxToPdfPureNode(
  docxBuffer: Buffer,
  options: PdfFromDocxOptions = {},
): Promise<Buffer> {
  const { title = "Documento", fontSize = 11, paragraphGap = 6 } = options;

  const zip = new PizZip(docxBuffer);
  const documentXml = zip.files["word/document.xml"]?.asText() ?? "";
  const paragraphs = extractParagraphsFromDocXml(documentXml);

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 72, bottom: 72, left: 72, right: 72 },
      info: { Title: title, Author: "Bocatas Digital" },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(fontSize);

    for (const para of paragraphs) {
      if (para.text.trim() === "") {
        doc.moveDown(0.4);
        continue;
      }
      if (para.isHeading) {
        doc
          .fontSize(para.headingLevel === 1 ? 14 : 12)
          .font("Helvetica-Bold")
          .text(para.text, { paragraphGap })
          .fontSize(fontSize)
          .font("Helvetica");
      } else if (para.isBold) {
        doc.font("Helvetica-Bold").text(para.text, { paragraphGap }).font("Helvetica");
      } else {
        doc.font("Helvetica").text(para.text, { paragraphGap });
      }
    }

    doc.end();
  });
}

// ── Internal helpers ──────────────────────────────────────────────────────────

interface ParsedParagraph {
  text: string;
  isBold: boolean;
  isHeading: boolean;
  headingLevel: number;
}

function extractParagraphsFromDocXml(xml: string): ParsedParagraph[] {
  const paragraphs: ParsedParagraph[] = [];
  const paraRegex = /<w:p[ >][\s\S]*?<\/w:p>/g;
  let paraMatch: RegExpExecArray | null;

  while ((paraMatch = paraRegex.exec(xml)) !== null) {
    const paraXml = paraMatch[0];
    const styleMatch = paraXml.match(/<w:pStyle w:val="([^"]+)"/);
    const styleVal = styleMatch?.[1] ?? "";
    const isHeading =
      /^[Hh]eading\d?$/.test(styleVal) || /^Título\d?$/.test(styleVal);
    const headingLevel = isHeading
      ? parseInt(styleVal.replace(/[^0-9]/g, "") || "1", 10)
      : 0;

    const runRegex = /<w:r[ >][\s\S]*?<\/w:r>/g;
    let runMatch: RegExpExecArray | null;
    let paraText = "";
    let anyBold = false;

    while ((runMatch = runRegex.exec(paraXml)) !== null) {
      const runXml = runMatch[0];
      const isBold = /<w:b(?:\s[^/]*)?\/?>/.test(runXml);
      if (isBold) anyBold = true;

      const tMatches = runXml.match(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g);
      if (tMatches) {
        for (const tMatch of tMatches) {
          const textContent = tMatch.replace(/<[^>]+>/g, "");
          paraText += textContent;
        }
      }
    }

    paragraphs.push({
      text: paraText,
      isBold: anyBold,
      isHeading,
      headingLevel,
    });
  }

  return paragraphs;
}
