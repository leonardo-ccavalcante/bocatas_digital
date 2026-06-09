/**
 * pdfFromDocxPureNode.ts
 *
 * Pure Node.js PDF generation from a .docx buffer.
 * Does NOT require LibreOffice — uses pdfkit to render text extracted from the DOCX.
 *
 * Approach:
 *   1. Unzip the .docx (which is a ZIP archive) using pizzip.
 *   2. Parse word/document.xml to extract paragraph text nodes.
 *   3. Render each paragraph to a pdfkit document.
 *   4. Return the PDF as a Buffer.
 *
 * Limitations:
 *   - Tables are rendered as plain text rows (no borders/layout).
 *   - Images in the DOCX are not included in the PDF output.
 *   - This is a functional fallback for Cloud Run where LibreOffice is unavailable.
 */

import PDFDocument from "pdfkit";
import PizZip from "pizzip";

export interface PdfFromDocxOptions {
  /** Optional title to embed in PDF metadata. */
  title?: string;
  /** Font size for body text. Default: 11 */
  fontSize?: number;
  /** Line gap between paragraphs in points. Default: 6 */
  paragraphGap?: number;
}

/**
 * Converts a .docx Buffer to a PDF Buffer using pdfkit.
 * Does NOT require LibreOffice.
 */
export async function convertDocxToPdfPureNode(
  docxBuffer: Buffer,
  options: PdfFromDocxOptions = {},
): Promise<Buffer> {
  const { title = "Documento", fontSize = 11, paragraphGap = 6 } = options;

  // ── 1. Extract text from DOCX ─────────────────────────────────────────────
  const zip = new PizZip(docxBuffer);
  const documentXml = zip.files["word/document.xml"]?.asText() ?? "";

  const paragraphs = extractParagraphsFromDocXml(documentXml);

  // ── 2. Render to PDF ──────────────────────────────────────────────────────
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
        // Empty paragraph → small vertical gap
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

/**
 * Parses word/document.xml and returns an array of paragraphs with basic
 * styling hints (bold, heading level).
 */
function extractParagraphsFromDocXml(xml: string): ParsedParagraph[] {
  const paragraphs: ParsedParagraph[] = [];

  // Match each <w:p> block
  const paraRegex = /<w:p[ >][\s\S]*?<\/w:p>/g;
  let paraMatch: RegExpExecArray | null;

  while ((paraMatch = paraRegex.exec(xml)) !== null) {
    const paraXml = paraMatch[0];

    // Detect heading style
    const styleMatch = paraXml.match(/<w:pStyle w:val="([^"]+)"/);
    const styleVal = styleMatch?.[1] ?? "";
    const isHeading = /^[Hh]eading\d?$/.test(styleVal) || /^Título\d?$/.test(styleVal);
    const headingLevel = isHeading
      ? parseInt(styleVal.replace(/[^0-9]/g, "") || "1", 10)
      : 0;

    // Collect all <w:r> runs
    const runRegex = /<w:r[ >][\s\S]*?<\/w:r>/g;
    let runMatch: RegExpExecArray | null;
    let paraText = "";
    let anyBold = false;

    while ((runMatch = runRegex.exec(paraXml)) !== null) {
      const runXml = runMatch[0];
      const isBold = /<w:b\/>/.test(runXml) || /<w:b w:val="true"/.test(runXml);
      if (isBold) anyBold = true;

      // Extract text nodes within this run
      const textRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
      let textMatch: RegExpExecArray | null;
      while ((textMatch = textRegex.exec(runXml)) !== null) {
        paraText += textMatch[1];
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
