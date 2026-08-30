/**
 * QR print document — the person name is operator-entered DB data written into
 * a same-origin, CSP-less popup via document.write. It MUST be HTML-escaped, or
 * a name like `<img onerror>` executes as stored XSS in the printing volunteer's
 * session (#170 / RC-79 / F070).
 */
import { describe, it, expect } from "vitest";
import { escapeHtml, buildQrPrintDocument } from "../qrPrintDocument";

describe("QR print document escaping (#170)", () => {
  it("escapeHtml neutralises HTML metacharacters", () => {
    expect(escapeHtml(`<img onerror="alert(1)">`)).toBe(
      "&lt;img onerror=&quot;alert(1)&quot;&gt;"
    );
  });

  it("renders a malicious name as text, not an element", () => {
    const html = buildQrPrintDocument(
      "<img src=x onerror=alert(1)>",
      "data:image/png;base64,AAAA",
      "abc12345"
    );
    expect(html).not.toContain("<img src=x onerror");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("keeps the generated QR image source intact", () => {
    const html = buildQrPrintDocument("Ana", "data:image/png;base64,AAAA", "abc12345");
    expect(html).toContain('<img src="data:image/png;base64,AAAA" alt="QR Code" />');
  });
});
