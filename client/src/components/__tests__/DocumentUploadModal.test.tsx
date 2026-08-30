import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, waitFor, fireEvent } from "@testing-library/react";

// Mirrors logic from DocumentUploadModal.tsx
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function isFileTooLarge(fileSize: number): boolean {
  return fileSize > MAX_FILE_BYTES;
}

function buildStoragePath(
  familyId: string,
  memberIndex: number,
  documentoTipo: string,
  ext: string,
  now: number = Date.now()
): string {
  return `${familyId}/${memberIndex}/${documentoTipo}/${now}.${ext}`;
}

function extFromMime(mime: string, fallback: string): string {
  if (mime.startsWith("image/")) return "jpg";
  if (mime === "application/pdf") return "pdf";
  return fallback;
}

describe("DocumentUploadModal — file size guard", () => {
  it("accepts files at exactly 10 MB", () => {
    expect(isFileTooLarge(10 * 1024 * 1024)).toBe(false);
  });

  it("rejects files over 10 MB", () => {
    expect(isFileTooLarge(10 * 1024 * 1024 + 1)).toBe(true);
  });

  it("accepts very small files", () => {
    expect(isFileTooLarge(100)).toBe(false);
  });
});

describe("DocumentUploadModal — storage path scheme", () => {
  const familyId = "d0000000-0000-0000-0000-000000000001";

  it("includes family + member_index + doc_type + timestamp + ext", () => {
    const path = buildStoragePath(familyId, -1, "padron_municipal", "jpg", 1700000000000);
    expect(path).toBe(`${familyId}/-1/padron_municipal/1700000000000.jpg`);
  });

  it("uses member_index = -1 for family-level docs", () => {
    const path = buildStoragePath(familyId, -1, "informe_social", "pdf", 1700000000000);
    expect(path).toContain("/-1/informe_social/");
  });

  it("uses member_index >= 0 for per-member docs", () => {
    const path = buildStoragePath(familyId, 0, "documento_identidad", "jpg", 1700000000000);
    expect(path).toContain("/0/documento_identidad/");
  });
});

describe("DocumentUploadModal — extension inference", () => {
  it("forces image/* to .jpg (post-compression)", () => {
    expect(extFromMime("image/png", "png")).toBe("jpg");
    expect(extFromMime("image/webp", "webp")).toBe("jpg");
    expect(extFromMime("image/jpeg", "jpeg")).toBe("jpg");
  });

  it("preserves application/pdf as .pdf", () => {
    expect(extFromMime("application/pdf", "")).toBe("pdf");
  });
});

/**
 * RC-03 — DocumentUploadModal must send the file bytes as base64 through
 * families.uploadFamilyDocument (server-side storage write, ADR-0002) instead
 * of the old row-then-browser-storage-upload-then-rollback dance that always
 * 403'd against the private family-documents bucket. The "DB-first ordering
 * invariant" cases that used to live here described that removed flow.
 */
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
global.ResizeObserver = global.ResizeObserver ?? ResizeObserverStub;
if (!Element.prototype.scrollIntoView) { Element.prototype.scrollIntoView = () => {}; }

afterEach(cleanup);

const { mockUploadMutateAsync, mockDeleteMutateAsync, mockStorageUpload } = vi.hoisted(() => ({
  mockUploadMutateAsync: vi.fn(),
  mockDeleteMutateAsync: vi.fn(),
  mockStorageUpload: vi.fn(),
}));

vi.mock("@/features/families/hooks/useFamilias", () => ({
  useUploadFamilyDocument: () => ({ mutateAsync: mockUploadMutateAsync, isPending: false }),
  useDeleteFamilyDocument: () => ({ mutateAsync: mockDeleteMutateAsync, mutate: vi.fn(), isPending: false }),
  useFamilyLevelDocuments: () => ({ data: [] }),
  useMemberLevelDocuments: () => ({ data: [] }),
  useAllFamilyDocuments: () => ({ data: [] }),
}));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
// Regression lock: the browser Supabase client must never be used again here.
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ storage: { from: () => ({ upload: mockStorageUpload }) } }),
}));
vi.mock("@/lib/posthog", () => ({ capture: vi.fn() }));
vi.mock("@/features/families/utils/signedUrl", () => ({ getSignedDocUrl: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { DocumentUploadModal } from "../DocumentUploadModal";

describe("DocumentUploadModal (RC-03)", () => {
  it("sends the PDF bytes as base64 through uploadFamilyDocument, never via browser Storage", async () => {
    mockUploadMutateAsync.mockResolvedValue({ id: "doc-1" });
    mockStorageUpload.mockResolvedValue({ error: null });

    const { container } = render(
      <DocumentUploadModal
        familyId="f1"
        documentoTipo="padron_municipal"
        memberIndex={-1}
        open
        onOpenChange={vi.fn()}
      />
    );

    const input = container.ownerDocument.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["content"], "padron.pdf", { type: "application/pdf" })] },
    });

    await waitFor(() => {
      expect(mockUploadMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          family_id: "f1",
          member_index: -1,
          documento_tipo: "padron_municipal",
          documento_url: expect.stringMatching(/^f1\/-1\/padron_municipal\/.+\.pdf$/),
          base64: "Y29udGVudA==",
          content_type: "application/pdf",
        })
      );
    });
    expect(mockStorageUpload).not.toHaveBeenCalled();
    expect(mockDeleteMutateAsync).not.toHaveBeenCalled();
  });
});
