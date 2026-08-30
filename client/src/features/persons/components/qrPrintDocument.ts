/**
 * Build the printable QR card as an HTML string for `document.write`.
 *
 * The print popup is same-origin and has no CSP, and the person name is
 * operator-entered DB data. Interpolating it unescaped was stored XSS: a name
 * such as `<img onerror=...>` executed script in the printing volunteer's
 * session (#170 / RC-79). Every untrusted value is HTML-escaped here; the QR
 * image source is our own generated data: URL (base64, no HTML metacharacters).
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildQrPrintDocument(
  fullName: string,
  qrDataUrl: string,
  idShort: string
): string {
  const name = escapeHtml(fullName);
  return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>QR — ${name}</title>
          <style>
            body { display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; font-family:sans-serif; gap:16px; }
            img { width:256px; height:256px; }
            h2 { margin:0; font-size:18px; }
            p { margin:0; color:#666; font-size:13px; }
          </style>
        </head>
        <body>
          <img src="${qrDataUrl}" alt="QR Code" />
          <h2>${name}</h2>
          <p>Bocatas Digital · ID: ${escapeHtml(idShort)}</p>
          <script>window.onload=()=>{window.print();window.close();}</script>
        </body>
      </html>
    `;
}
