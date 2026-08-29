/**
 * persons_nombre_norm.migration.test.ts — RC-06 (F027/F065).
 *
 * Name search must be accent- and word-order-insensitive. That needs DB
 * support: an unaccented generated column persons.nombre_norm, a trigram
 * index (name-search < 2 s budget, AGENTS.md), and persons_safe re-exposing
 * the column (checkin.searchPersons reads the view). The view MUST keep
 * excluding the 4 high-risk fields — its column projection is part of the
 * PII wall (ADR-0002). Content-assert pattern:
 * persons_photo_buckets.migration.test.ts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const MIGRATIONS_DIR = resolve(__dirname, "../../supabase/migrations");

function migrationSql(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"));
}

describe("persons.nombre_norm search support must be created by a migration", () => {
  const sources = migrationSql();

  it("enables the unaccent extension", () => {
    expect(
      sources.some((sql) => /CREATE EXTENSION IF NOT EXISTS unaccent/i.test(sql)),
      "no migration enables unaccent — ilike stays accent-sensitive"
    ).toBe(true);
  });

  it("adds persons.nombre_norm as a STORED generated column via an IMMUTABLE unaccent wrapper", () => {
    const sql = sources.find((s) => /ADD COLUMN IF NOT EXISTS nombre_norm/i.test(s));
    expect(sql, "no migration adds persons.nombre_norm").toBeDefined();
    expect(/GENERATED ALWAYS AS[\s\S]{0,200}f_unaccent[\s\S]{0,200}STORED/i.test(sql!)).toBe(true);
    // plain unaccent() is STABLE and unusable in a generated column
    expect(/IMMUTABLE/.test(sql!)).toBe(true);
  });

  it("indexes nombre_norm with gin_trgm_ops (manual search < 2 s budget)", () => {
    expect(
      sources.some((sql) =>
        /CREATE INDEX IF NOT EXISTS idx_persons_nombre_norm_trgm[\s\S]{0,200}gin_trgm_ops/i.test(sql)
      )
    ).toBe(true);
  });

  it("recreates persons_safe exposing nombre_norm but STILL excluding the 4 high-risk fields", () => {
    const sql = sources.find(
      (s) => /CREATE VIEW public\.persons_safe/i.test(s) && /nombre_norm/.test(s)
    );
    expect(sql, "no migration recreates persons_safe with nombre_norm").toBeDefined();
    const viewBody = sql!.slice(sql!.search(/CREATE VIEW public\.persons_safe/i));
    for (const banned of [
      "foto_documento_url",
      "situacion_legal",
      "recorrido_migratorio",
      "notas_privadas",
    ]) {
      expect(viewBody.includes(banned), `persons_safe must not expose ${banned}`).toBe(false);
    }
    expect(/security_invoker\s*=\s*true/i.test(viewBody)).toBe(true);
  });
});
