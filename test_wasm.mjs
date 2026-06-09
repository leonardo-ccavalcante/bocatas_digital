import { readFileSync } from 'node:fs';
import pkg from '@nativedocuments/docx-wasm';
const { WASM } = pkg;

const docxBuf = readFileSync('./server/_core/__fixtures__/derivacion_hoja_template_v1.docx');

try {
  const api = await WASM.load();
  const doc = await api.load(docxBuf);
  const pdf = await doc.exportPDF();
  console.log('SUCCESS — PDF size:', pdf.byteLength, 'bytes');
  doc.destroy();
  api.destroy();
} catch (e) {
  console.error('FAIL:', e.message ?? e);
  process.exit(1);
}
