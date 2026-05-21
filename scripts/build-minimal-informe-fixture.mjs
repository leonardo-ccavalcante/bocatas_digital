/**
 * Generates the minimal DOCX fixture used in renderDocument unit tests.
 *
 * Produces:  server/services/__fixtures__/minimal-informe.docx
 *
 * Delimiters: docxtemplater v3 default single braces  {placeholder}
 *
 * Run once with:
 *   node scripts/build-minimal-informe-fixture.mjs
 */

import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");

// ── Minimal OOXML parts ──────────────────────────────────────────────────────

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml"
    ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const dotRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
    Target="word/document.xml"/>
</Relationships>`;

const wordDocRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;

// Document contains the two placeholders used by the render test.
// docxtemplater v3 default delimiter: single braces { }
const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:t xml:space="preserve">Nombre: {titular.nombre}</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t xml:space="preserve">Familia: {familia.numero}</w:t></w:r>
    </w:p>
    <w:sectPr/>
  </w:body>
</w:document>`;

// ── Build zip ────────────────────────────────────────────────────────────────

const zip = new PizZip();
zip.file("[Content_Types].xml", contentTypes);
zip.folder("_rels").file(".rels", dotRels);
zip.folder("word").file("document.xml", documentXml);
zip.folder("word/_rels").file("document.xml.rels", wordDocRels);

// ── Smoke-render to validate the fixture renders without error ────────────────

const doc = new Docxtemplater(zip, {
  paragraphLoop: true,
  linebreaks: true,
  nullGetter: () => "",
});

doc.render({ titular: { nombre: "FIXTURE_TEST" }, familia: { numero: "0000" } });
const smokeOut = doc.getZip().generate({ type: "nodebuffer" });
if (smokeOut.length === 0) {
  throw new Error("Smoke render produced empty output — fixture is broken.");
}

// ── Re-build clean zip (unrendered) for the fixture ──────────────────────────

const cleanZip = new PizZip();
cleanZip.file("[Content_Types].xml", contentTypes);
cleanZip.folder("_rels").file(".rels", dotRels);
cleanZip.folder("word").file("document.xml", documentXml);
cleanZip.folder("word/_rels").file("document.xml.rels", wordDocRels);

const buffer = cleanZip.generate({ type: "nodebuffer" });

const outPath = path.resolve(
  __dirname,
  "../server/services/__fixtures__/minimal-informe.docx"
);

fs.writeFileSync(outPath, buffer);
console.log(`Written: ${outPath} (${buffer.length} bytes)`);
console.log("Smoke render verified OK — fixture is renderable by docxtemplater.");
