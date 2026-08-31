/**
 * RC-03 regression lock (F050/F078/F184): these components once wrote to
 * Supabase (storage uploads / consents upsert) from the browser with the anon
 * key. The buckets are PRIVATE with no storage policies and consents RLS
 * admits no anon role, so every write 401/403'd. All writes go through tRPC
 * (ADR-0002) — the import itself is the forbidden pattern.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const COMPONENTS = [
  "client/src/features/persons/components/ConsentModal.tsx",
  "client/src/features/familias-reparto/components/SignedActaUpload.tsx",
  "client/src/components/DocumentUploadModal.tsx",
  "client/src/features/uploads-tab/UploadModal.tsx",
  // Pintan imágenes que salen de Storage: exactamente la regresión que este
  // bloqueo evita (nada de cliente Supabase de navegador ni getPublicUrl).
  "client/src/features/persons/components/documents/PersonDocumentsModal.tsx",
  "client/src/features/persons/components/documents/PersonDocumentViewer.tsx",
];

describe("RC-03 — no browser-side Supabase writes", () => {
  it.each(COMPONENTS)("%s does not import the browser Supabase client", (rel) => {
    const src = readFileSync(resolve(__dirname, "../../..", rel), "utf8");
    expect(src).not.toMatch(/@\/lib\/supabase\/client/);
    expect(src).not.toMatch(/getPublicUrl/);
  });
});
