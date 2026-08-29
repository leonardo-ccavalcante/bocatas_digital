/**
 * persons_photo_buckets.migration.test.ts
 *
 * `server/routers/persons/photo.ts` writes to the buckets named by its own Zod
 * enum — `fotos-perfil` and `documentos-consentimiento` — and
 * `client/src/features/persons/components/ConsentModal.tsx` writes to
 * `documentos-consentimiento` too. NO migration has ever created either bucket:
 * only `firmas-entregas`, `documentos-fisicos-entregas`, `program-documents`,
 * `program-document-templates` and `family-documents` exist. The RLS file
 * 20260411082152_..._create_storage_rls.sql references a *third* spelling
 * (`consentimientos`) that is created nowhere either — policies on a phantom
 * bucket.
 *
 * The uploads used to go to Manus object storage, so the missing buckets were
 * invisible; pointing them at Supabase makes a fresh `supabase db reset` fail
 * with `StorageApiError: Bucket not found`. Same class as gh #134, same
 * content-assert pattern as family_documents_bucket.migration.test.ts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const MIGRATIONS_DIR = resolve(__dirname, "../../supabase/migrations");

const creates = (bucket: string) =>
  new RegExp(`INSERT\\s+INTO\\s+storage\\.buckets[\\s\\S]{0,800}?'${bucket}'`, "i");

function migrationSql(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith(".sql"))
    .map(f => readFileSync(join(MIGRATIONS_DIR, f), "utf8"));
}

describe("persons photo storage buckets must be created by a migration", () => {
  const sources = migrationSql();

  it.each(["fotos-perfil", "documentos-consentimiento"])(
    "some migration inserts the '%s' bucket into storage.buckets",
    bucket => {
      expect(
        sources.some(sql => creates(bucket).test(sql)),
        `No migration creates the '${bucket}' Storage bucket, but ` +
          `server/routers/persons/photo.ts uploads to it. A fresh ` +
          `\`supabase db reset\` leaves it missing → StorageApiError: Bucket not found.`
      ).toBe(true);
    }
  );

  it("creates both buckets PRIVATE — they hold beneficiary faces and signed consents (RGPD Art. 7 evidence)", () => {
    const sql = sources.find(s => creates("fotos-perfil").test(s));
    expect(sql, "migration not found").toBeDefined();
    // Neither bucket may ever be public: a public bucket URL is unauthenticated
    // and permanently replayable — the CAS-02 failure mode.
    expect(/'fotos-perfil',\s*'fotos-perfil',\s*false/i.test(sql!)).toBe(true);
    expect(
      /'documentos-consentimiento',\s*'documentos-consentimiento',\s*false/i.test(sql!)
    ).toBe(true);
  });
});
