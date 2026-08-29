/**
 * F050/F078 (RC-03) — the ficha's ConsentModal must write through tRPC:
 *   · document photos via persons.uploadPhoto (private bucket, server-side,
 *     stores the storage PATH — never getPublicUrl),
 *   · consent rows via persons.saveConsents, including granted:false rows so a
 *     consent can be REVOKED from the ficha.
 * Direct browser Supabase writes 401/403 against RLS (ADR-0002).
 */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
global.ResizeObserver = global.ResizeObserver ?? ResizeObserverStub;
if (!Element.prototype.scrollIntoView) { Element.prototype.scrollIntoView = () => {}; }
if (!Element.prototype.hasPointerCapture) { Element.prototype.hasPointerCapture = () => false; }
if (!Element.prototype.setPointerCapture) { Element.prototype.setPointerCapture = () => {}; }
if (!Element.prototype.releasePointerCapture) { Element.prototype.releasePointerCapture = () => {}; }

afterEach(cleanup);

const { mockUploadPhoto, mockSaveConsents, mockCompressImage } = vi.hoisted(() => ({
  mockUploadPhoto: vi.fn(),
  mockSaveConsents: vi.fn(),
  mockCompressImage: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    persons: {
      uploadPhoto: { useMutation: () => ({ mutateAsync: mockUploadPhoto }) },
      saveConsents: { useMutation: () => ({ mutateAsync: mockSaveConsents }) },
    },
  },
}));

vi.mock("../utils/imageUtils", () => ({
  compressImage: mockCompressImage,
  base64ToBlob: vi.fn(),
}));

// Loadable during the RED phase (old component imports it); the regression
// lock in client/src/__tests__/no-browser-storage-writes.test.ts forbids the
// import itself afterwards.
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    storage: { from: () => ({ upload: vi.fn(async () => ({ data: { path: "x" }, error: null })), getPublicUrl: () => ({ data: { publicUrl: "http://dead" } }) }) },
    from: () => ({ upsert: vi.fn(async () => ({ error: null })) }),
  }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { ConsentModal } from "../components/ConsentModal";
import type { ConsentTemplate } from "../schemas";

const PERSON_ID = "5a5eda80-33d0-414a-a464-ee0cd827d987";

const TEMPLATES: ConsentTemplate[] = [
  { id: "11111111-1111-4111-8111-111111111111", purpose: "tratamiento_datos_banco_alimentos", idioma: "es", version: "1.0", text_content: "Texto Banco de Alimentos suficientemente largo.", is_active: true, updated_at: null },
  { id: "22222222-2222-4222-8222-222222222222", purpose: "compartir_datos_red", idioma: "es", version: "1.0", text_content: "Texto compartir datos en red suficientemente largo.", is_active: true, updated_at: null },
];

function renderModal() {
  return render(
    <ConsentModal open personId={PERSON_ID} templates={TEMPLATES} onClose={vi.fn()} onSaved={vi.fn()} />
  );
}

describe("ConsentModal — tRPC writes (RC-03)", () => {
  it("saves granted AND revoked rows through persons.saveConsents", async () => {
    mockSaveConsents.mockResolvedValue([]);
    renderModal();

    await userEvent.click(screen.getByRole("checkbox", { name: /Banco de Alimentos/ }));
    const red = screen.getByRole("checkbox", { name: /Compartir datos en red/ });
    await userEvent.click(red);
    await userEvent.click(red); // on → off = explicit revocation

    await userEvent.click(screen.getByRole("button", { name: "Guardar consentimientos" }));

    await waitFor(() => {
      expect(mockSaveConsents).toHaveBeenCalledWith(
        expect.objectContaining({
          personId: PERSON_ID,
          consents: expect.arrayContaining([
            expect.objectContaining({ purpose: "tratamiento_datos_banco_alimentos", granted: true }),
            expect.objectContaining({ purpose: "compartir_datos_red", granted: false }),
          ]),
        })
      );
    });
  });

  it("uploads the consent document via persons.uploadPhoto and saves the storage PATH (never a public URL)", async () => {
    mockCompressImage.mockResolvedValue("QkFTRTY0");
    mockUploadPhoto.mockResolvedValue({ bucket: "documentos-consentimiento", path: "1700-abc.jpg" });
    mockSaveConsents.mockResolvedValue([]);
    const { container } = renderModal();

    await userEvent.click(screen.getByRole("checkbox", { name: /Banco de Alimentos/ }));
    await userEvent.click(screen.getByRole("button", { name: /Adjuntar documento firmado/ }));

    const fileInput = container.ownerDocument.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(["img"], "doc.jpg", { type: "image/jpeg" })] } });

    await waitFor(() => {
      expect(mockUploadPhoto).toHaveBeenCalledWith({ bucket: "documentos-consentimiento", base64: "QkFTRTY0" });
    });

    await userEvent.click(screen.getByRole("button", { name: "Guardar consentimientos" }));
    await waitFor(() => {
      expect(mockSaveConsents).toHaveBeenCalledWith(
        expect.objectContaining({
          consents: expect.arrayContaining([
            expect.objectContaining({
              purpose: "tratamiento_datos_banco_alimentos",
              documento_foto_url: "1700-abc.jpg",
            }),
          ]),
        })
      );
    });
  });
});
