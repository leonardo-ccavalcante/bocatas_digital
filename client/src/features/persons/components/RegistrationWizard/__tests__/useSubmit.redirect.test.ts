/**
 * useSubmit.redirect.test.ts — RC-07 (F054).
 * Tras registrar, un voluntario debe aterrizar en /personas/:id/qr (página
 * voluntario-safe) y no en la ficha /personas/:id (persons.getById es
 * admin-only por diseño, #46). Chequeo a nivel de fuente — mismo patrón que
 * RepartoTab.ux.test.tsx.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const src = readFileSync(path.resolve(__dirname, "../_useSubmit.ts"), "utf-8");

describe("RegistrationWizard — redirección tras registrar", () => {
  it("navega según rol: admin a la ficha, resto a la tarjeta QR", () => {
    expect(src).toMatch(/isAdmin\s*\?\s*`\/personas\/\$\{person\.id\}`\s*:\s*`\/personas\/\$\{person\.id\}\/qr`/);
  });

  it("obtiene el rol de useAuth", () => {
    expect(src).toContain('from "@/_core/hooks/useAuth"');
  });
});
