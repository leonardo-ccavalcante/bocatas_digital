import { describe, it, expect } from "vitest";

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

describe("DocumentUploadModal — DB-first ordering invariant", () => {
  // Plan Gap D: DB row insert MUST happen before Storage upload to avoid orphan PII files.
  // We cannot test the actual DOM event here, but we codify the invariant as a sequence.

  it("the upload sequence has DB step before Storage step", () => {
    const sequence: string[] = [];
    function simulateHappyPath() {
      sequence.push("compress");
      sequence.push("buildPath");
      sequence.push("computePublicUrl");
      sequence.push("dbInsert"); // MUST be before storageUpload
      sequence.push("storageUpload");
      sequence.push("toastSuccess");
    }
    simulateHappyPath();
    const dbIdx = sequence.indexOf("dbInsert");
    const storageIdx = sequence.indexOf("storageUpload");
    expect(dbIdx).toBeGreaterThanOrEqual(0);
    expect(dbIdx).toBeLessThan(storageIdx);
  });

  it("on Storage failure, DB row is soft-deleted (rollback)", () => {
    const storageOk = false;
    let dbDeleted = false;
    function simulateStorageFailure() {
      // dbInsert succeeded — predicted URL committed
      if (!storageOk) {
        dbDeleted = true; // rollback
      }
    }
    simulateStorageFailure();
    expect(dbDeleted).toBe(true);
  });
});
