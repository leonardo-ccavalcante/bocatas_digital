/**
 * pdfFromDocxPureNode.ts
 *
 * Pure Node.js PDF generation for Derivar Hoja.
 * Does NOT require LibreOffice — uses pdfkit to render a visual layout
 * that mirrors the DOCX template (red table header, colors, logos).
 *
 * Two exports:
 *   - renderDerivarHojaPdf(data, logos?) → Buffer  [primary, visual layout]
 *   - convertDocxToPdfPureNode(docxBuf, options?) → Buffer  [legacy text fallback]
 */

import PDFDocument from "pdfkit";
import PizZip from "pizzip";
import type { DerivarHojaTemplateData, DerivarLogoOptions } from "./docxRender";

// ── Color palette (mirrors DOCX template) ────────────────────────────────────
const COLOR_RED = "#C0392B"; // Table header background
const COLOR_RED_TITLE = "#8B0000"; // Document title
const COLOR_WHITE = "#FFFFFF";
const COLOR_DARK = "#222222";
const COLOR_GRAY = "#666666";
const COLOR_ROW_ALT = "#F9F0F0"; // Alternating row background

// ── Page layout ───────────────────────────────────────────────────────────────
const MARGIN = 50;
const PAGE_WIDTH = 595.28; // A4 points
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// ── Table column widths (proportional to DOCX template) ──────────────────────
const COL_FECHA = 65;
const COL_TIPO = 90;
const COL_DESC = 115;
const COL_RECURSO = 115;
const COL_OBS = 80;
const COL_FIRMA = CONTENT_WIDTH - COL_FECHA - COL_TIPO - COL_DESC - COL_RECURSO - COL_OBS;

const TABLE_HEADERS = ["Fecha", "Tipo", "Descripción", "Recurso", "Obs.", "Firma"];
const COL_WIDTHS = [COL_FECHA, COL_TIPO, COL_DESC, COL_RECURSO, COL_OBS, COL_FIRMA];

const FOOTER_TEXT =
  "CLÁUSULA DE PROTECCIÓN DE DATOS: Los datos personales recogidos en este documento serán tratados por Todos Los Bocatas Saben Igual con la finalidad de gestionar el programa de ayuda social. Base legal: consentimiento del interesado (RGPD Art. 6.1.a). Puede ejercer sus derechos de acceso, rectificación, supresión y portabilidad contactando con el responsable del tratamiento.";

// ── Public API ────────────────────────────────────────────────────────────────

export interface PdfFromDocxOptions {
  /** Optional title to embed in PDF metadata. */
  title?: string;
  /** Font size for body text. Default: 11 */
  fontSize?: number;
  /** Line gap between paragraphs in points. Default: 6 */
  paragraphGap?: number;
}

/**
 * Renders a Derivar Hoja as a styled PDF using pdfkit.
 * Mirrors the visual layout of the DOCX template.
 */
export async function renderDerivarHojaPdf(
  data: DerivarHojaTemplateData,
  logos?: DerivarLogoOptions,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: MARGIN, bottom: MARGIN + 40, left: MARGIN, right: MARGIN },
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
    const logoHeight = 40;
    const logoWidth = 40;

    if (logos?.bocatasLogo && logos.bocatasLogo.length > 0) {
      try {
        doc.image(logos.bocatasLogo, MARGIN, MARGIN, {
          width: logoWidth,
          height: logoHeight,
          fit: [logoWidth, logoHeight],
        });
      } catch {
        // Logo failed to load — skip silently
      }
    }

    if (logos?.secondaryLogo && logos.secondaryLogo.length > 0) {
      try {
        doc.image(logos.secondaryLogo, PAGE_WIDTH - MARGIN - logoWidth, MARGIN, {
          width: logoWidth,
          height: logoHeight,
          fit: [logoWidth, logoHeight],
        });
      } catch {
        // Secondary logo failed to load — skip silently
      }
    }

    // ── Title ─────────────────────────────────────────────────────────────────
    const titleY = MARGIN + logoHeight + 12;
    doc
      .font("Helvetica-Bold")
      .fontSize(13)
      .fillColor(COLOR_RED_TITLE)
      .text("HOJA DE REGISTRO DE DERIVACIONES E INTERVENCIONES", MARGIN, titleY, {
        width: CONTENT_WIDTH,
        align: "center",
      });

    // ── Patient/family info ───────────────────────────────────────────────────
    let y = titleY + 28;
    const labelWidth = 160;

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
        .fontSize(9)
        .fillColor(COLOR_DARK)
        .text(label, MARGIN, y, { width: labelWidth, continued: false });
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(COLOR_DARK)
        .text(value, MARGIN + labelWidth, y, { width: CONTENT_WIDTH - labelWidth });
      y += 14;
    }

    y += 8;

    // ── Table ─────────────────────────────────────────────────────────────────
    const ROW_HEIGHT = 18;
    const HEADER_HEIGHT = 22;
    const FONT_SIZE_TABLE = 7.5;

    // Table header
    let x = MARGIN;
    doc.rect(MARGIN, y, CONTENT_WIDTH, HEADER_HEIGHT).fill(COLOR_RED);

    for (let i = 0; i < TABLE_HEADERS.length; i++) {
      doc
        .font("Helvetica-Bold")
        .fontSize(FONT_SIZE_TABLE)
        .fillColor(COLOR_WHITE)
        .text(TABLE_HEADERS[i], x + 3, y + 6, {
          width: COL_WIDTHS[i] - 6,
          align: "center",
          lineBreak: false,
        });
      x += COL_WIDTHS[i];
    }
    y += HEADER_HEIGHT;

    // Table rows
    if (data.intervenciones.length === 0) {
      doc
        .font("Helvetica")
        .fontSize(FONT_SIZE_TABLE)
        .fillColor(COLOR_GRAY)
        .text("Sin intervenciones registradas", MARGIN + 4, y + 5, {
          width: CONTENT_WIDTH - 8,
          align: "center",
        });
      y += ROW_HEIGHT;
    } else {
      for (let rowIdx = 0; rowIdx < data.intervenciones.length; rowIdx++) {
        const interv = data.intervenciones[rowIdx];

        // Check if we need a new page
        if (y + ROW_HEIGHT > doc.page.height - MARGIN - 60) {
          doc.addPage();
          y = MARGIN;
          // Redraw table header on new page
          x = MARGIN;
          doc.rect(MARGIN, y, CONTENT_WIDTH, HEADER_HEIGHT).fill(COLOR_RED);
          for (let i = 0; i < TABLE_HEADERS.length; i++) {
            doc
              .font("Helvetica-Bold")
              .fontSize(FONT_SIZE_TABLE)
              .fillColor(COLOR_WHITE)
              .text(TABLE_HEADERS[i], x + 3, y + 6, {
                width: COL_WIDTHS[i] - 6,
                align: "center",
                lineBreak: false,
              });
            x += COL_WIDTHS[i];
          }
          y += HEADER_HEIGHT;
        }

        // Alternating row background
        if (rowIdx % 2 === 1) {
          doc.rect(MARGIN, y, CONTENT_WIDTH, ROW_HEIGHT).fill(COLOR_ROW_ALT);
        }

        const cells = [
          interv.fecha,
          interv.tipo,
          interv.descripcion,
          interv.recursoNombre,
          interv.observaciones,
          interv.firmaPlaceholder,
        ];

        x = MARGIN;
        for (let i = 0; i < cells.length; i++) {
          doc
            .font("Helvetica")
            .fontSize(FONT_SIZE_TABLE)
            .fillColor(COLOR_DARK)
            .text(cells[i] ?? "", x + 3, y + 5, {
              width: COL_WIDTHS[i] - 6,
              lineBreak: false,
              ellipsis: true,
            });
          x += COL_WIDTHS[i];
        }

        // Row border
        doc
          .moveTo(MARGIN, y + ROW_HEIGHT)
          .lineTo(MARGIN + CONTENT_WIDTH, y + ROW_HEIGHT)
          .strokeColor("#DDDDDD")
          .lineWidth(0.3)
          .stroke();

        y += ROW_HEIGHT;
      }
    }

    // Table outer border
    doc
      .rect(MARGIN, titleY + 28 + infoRows.length * 14 + 8, CONTENT_WIDTH, y - (titleY + 28 + infoRows.length * 14 + 8))
      .strokeColor(COLOR_RED)
      .lineWidth(0.5)
      .stroke();

    // ── Footer: data protection clause ───────────────────────────────────────
    const footerY = doc.page.height - MARGIN - 35;
    doc
      .font("Helvetica")
      .fontSize(6)
      .fillColor(COLOR_GRAY)
      .text(FOOTER_TEXT, MARGIN, footerY, {
        width: CONTENT_WIDTH,
        align: "justify",
      });

    doc.end();
  });
}

/**
 * Legacy: Converts a .docx Buffer to a PDF Buffer using pdfkit.
 * Extracts text from the DOCX and renders it as plain text.
 * Does NOT require LibreOffice.
 *
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
      info: {
        Title: title,
        Author: "Bocatas Digital",
        Creator: "Bocatas Digital — pdfFromDocxPureNode",
      },
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
        doc
          .font("Helvetica-Bold")
          .text(para.text, { paragraphGap })
          .font("Helvetica");
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
      const isBold =
        /<w:b\/>/.test(runXml) || /<w:b w:val="true"/.test(runXml);
      if (isBold) anyBold = true;
      const textRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
      let textMatch: RegExpExecArray | null;
      while ((textMatch = textRegex.exec(runXml)) !== null) {
        paraText += textMatch[1];
      }
    }

    paragraphs.push({ text: paraText, isBold: anyBold, isHeading, headingLevel });
  }

  return paragraphs;
}
