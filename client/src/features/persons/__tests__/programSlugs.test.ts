/**
 * programSlugs.test.ts — el slug del Programa Familias tiene que seguir al de la base.
 *
 * La migración `20260507000002` renombró `programs.slug` de `familia` a
 * `programa_familias` PRECISAMENTE porque el frontend ya usaba el nombre nuevo.
 * El wizard de alta se quedó atrás con `"familia"`, y como el slug sólo se
 * compara —nunca se busca— el fallo fue mudo durante meses:
 *
 *   · el paso de composición del hogar no aparecía nunca;
 *   · y el consentimiento del Banco de Alimentos no se pedía jamás por esta
 *     vía — que es el que sostiene la subvención.
 *
 * Este test ata la constante al SQL de la migración que manda, para que un
 * renombrado futuro rompa aquí y no en producción seis meses después.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SLUG_PROGRAMA_FAMILIAS } from "../components/RegistrationWizard/_shared";

const MIGRACION = resolve(
  __dirname,
  "../../../../../supabase/migrations/20260507000002_rename_familia_slug_to_programa_familias.sql"
);

describe("slug del Programa Familias", () => {
  it("coincide con el valor que fija la migración del renombrado", () => {
    const sql = readFileSync(MIGRACION, "utf8");
    const match = sql.match(/SET slug = '([a-z0-9_]+)'/);
    expect(match?.[1]).toBe(SLUG_PROGRAMA_FAMILIAS);
  });

  it("no es el valor viejo", () => {
    expect(SLUG_PROGRAMA_FAMILIAS).not.toBe("familia");
  });
});
