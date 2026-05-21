/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { DocumentPreviewDialog } from "../DocumentPreviewDialog";

beforeAll(() => {
  // jsdom does not implement URL.createObjectURL
  globalThis.URL.createObjectURL = vi.fn(() => "blob:mock-url");
});

const base64 = Buffer.from("docx-bytes").toString("base64");
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

describe("DocumentPreviewDialog", () => {
  it("renders a download link and does NOT embed an Office Online iframe (RGPD: PII stays on-origin)", () => {
    render(
      <DocumentPreviewDialog
        open
        onOpenChange={() => {}}
        bufferBase64={base64}
        fileName="informe-social-F0042-2026-05-21.docx"
        mime={DOCX_MIME}
      />
    );

    const link = screen.getByRole("link", { name: /descargar/i });
    expect(link).toHaveAttribute("download", "informe-social-F0042-2026-05-21.docx");

    // The Office Online viewer would leak beneficiary PII to a third party — it
    // must not be present.
    expect(document.querySelector("iframe")).toBeNull();
    expect(document.body.innerHTML).not.toContain("officeapps.live.com");
  });
});
