/**
 * TDD tests for Reparto UX improvements.
 * Architecture: "Lista de distribución" is now a top-level tab in ProgramTabs,
 * not a sub-tab inside FamiliasTab. FamiliasTab no longer has nested tabs.
 *
 * These tests verify:
 * 1. ProgramTabs has "Lista de distribución" as a top-level tab label
 * 2. FamiliasTab no longer has nested tabs (no double tab row)
 * 3. RepartoTab has a clear empty state with "Lista de distribución" language
 * 4. The printable documents are ROUND-LEVEL actas (Citación/Final), not per-day
 *    Hoja de Firmas / Listado interno tabs.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const programTabsPath = path.resolve(
  __dirname,
  "../../../features/programs/components/ProgramTabs.tsx",
);
const familiasTabPath = path.resolve(
  __dirname,
  "../../familias-tab/index.tsx",
);
const repartoTabPath = path.resolve(
  __dirname,
  "../components/RepartoTab.tsx",
);
const useTabParamPath = path.resolve(
  __dirname,
  "../../../features/programs/hooks/useTabParam.ts",
);

const programTabsSource = readFileSync(programTabsPath, "utf-8");
const familiasTabSource = readFileSync(familiasTabPath, "utf-8");
const repartoTabSource = readFileSync(repartoTabPath, "utf-8");
const useTabParamSource = readFileSync(useTabParamPath, "utf-8");

describe("UX: Lista de distribución — arquitectura de tabs", () => {
  // Test 1: ProgramTabs has "Lista de distribución" as top-level tab
  it('ProgramTabs: debe tener "Lista de distribución" como tab de nivel superior', () => {
    expect(programTabsSource).toContain("Lista de distribución");
    expect(programTabsSource).toContain('"repartos"');
    expect(programTabsSource).toContain("RepartoTab");
  });

  // Test 2: FamiliasTab no longer has nested tabs (no double tab row)
  it("FamiliasTab: no debe tener tabs anidados (sin doble fila de tabs)", () => {
    // FamiliasTab should not import or use Tabs/TabsTrigger anymore
    expect(familiasTabSource).not.toContain("TabsTrigger");
    expect(familiasTabSource).not.toContain("TabsList");
    // Should not have "Repartos" or "Lista de distribución" sub-tab
    expect(familiasTabSource).not.toMatch(/TabsTrigger[^>]*>.*Repartos.*<\/TabsTrigger>/);
  });

  // Test 3: useTabParam includes "repartos" in PROGRAM_TABS and ENABLED_TABS
  it('useTabParam: "repartos" debe estar en PROGRAM_TABS y ENABLED_TABS', () => {
    expect(useTabParamSource).toContain('"repartos"');
    // Should be in the ProgramTab type
    expect(useTabParamSource).toMatch(/ProgramTab.*repartos|repartos.*ProgramTab/);
  });

  // Test 4: RepartoTab has a clear empty state with "Lista de distribución" language
  it("RepartoTab: debe mostrar un empty state con CTA claro cuando no hay repartos", () => {
    expect(repartoTabSource.toLowerCase()).toContain("lista de distribución");
    expect(repartoTabSource).toMatch(/Genera\s+la\s+lista|Crear\s+lista|lista\s+de\s+distribución/i);
  });

  // Test 5: Documents are the ROUND-LEVEL actas (citación antes / final después),
  // not the old per-day "Hoja de Firmas" / "Listado interno" print tabs.
  it("RepartoTab: los documentos son actas de ronda (Citación/Final), no por día", () => {
    // The two round-level document tabs exist and render RepartoActaPrint.
    expect(repartoTabSource).toContain("Acta de Citación");
    expect(repartoTabSource).toContain("Acta Final");
    expect(repartoTabSource).toContain('variant="citacion"');
    expect(repartoTabSource).toContain('variant="final"');
    expect(repartoTabSource).toContain("Documentos del reparto");
    // The old per-day print tabs/components are gone.
    expect(repartoTabSource).not.toContain('value="listado"');
    expect(repartoTabSource).not.toContain("HojaFirmasPrint");
    expect(repartoTabSource).not.toContain("ListadoInternoPrint");
  });

  // Test 6: Empty state has a "Generar lista" button
  it("RepartoTab: empty state debe tener un botón de acción principal visible", () => {
    expect(repartoTabSource).toMatch(/Generar\s+lista|Crear\s+reparto|Nuevo\s+reparto/i);
  });
});
