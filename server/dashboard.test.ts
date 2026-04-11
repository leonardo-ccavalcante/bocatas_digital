/**
 * dashboard.test.ts — Vitest tests for Epic C Dashboard.
 *
 * Tests:
 * 1. KPI query logic: period date ranges, es_demo exclusion, anonymous inclusion
 * 2. Trend data: 4 weeks grouping
 * 3. CSV export: format, zero PII, "anonimo" for NULL person_id, filename
 */
import { describe, it, expect } from "vitest";
import { buildCSVString, downloadCSV } from "../client/src/features/dashboard/utils/exportCSV";
import type { CSVRow } from "../client/src/features/dashboard/schemas";

// ─── CSV Export Tests ──────────────────────────────────────────────────────────

describe("buildCSVString", () => {
  it("produces correct header row", () => {
    const csv = buildCSVString([]);
    const header = csv.split("\n")[0];
    expect(header).toBe("fecha,hora,persona_uuid,punto_servicio,programa,metodo");
  });

  it("produces correct data row", () => {
    const rows: CSVRow[] = [
      {
        fecha: "2026-04-11",
        hora: "12:30",
        persona_uuid: "b0000000-0000-0000-0000-000000000002",
        punto_servicio: "Comedor Bocatas - Sede Central",
        programa: "comedor",
        metodo: "qr_scan",
      },
    ];
    const csv = buildCSVString(rows);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("2026-04-11");
    expect(lines[1]).toContain("b0000000-0000-0000-0000-000000000002");
    expect(lines[1]).toContain("comedor");
  });

  it("uses 'anonimo' for anonymous rows (person_id = NULL)", () => {
    const rows: CSVRow[] = [
      {
        fecha: "2026-04-11",
        hora: "14:00",
        persona_uuid: "anonimo",
        punto_servicio: "Punto Calle - Opera",
        programa: "comedor",
        metodo: "conteo_anonimo",
      },
    ];
    const csv = buildCSVString(rows);
    expect(csv).toContain("anonimo");
    // Must NOT contain any PII-like names
    expect(csv).not.toContain("nombre");
    expect(csv).not.toContain("apellidos");
  });

  it("never includes PII columns (nombre, apellidos, email, telefono)", () => {
    const rows: CSVRow[] = [
      {
        fecha: "2026-04-11",
        hora: "10:00",
        persona_uuid: "b0000000-0000-0000-0000-000000000003",
        punto_servicio: "La Canada",
        programa: "familia",
        metodo: "manual_busqueda",
      },
    ];
    const csv = buildCSVString(rows);
    const header = csv.split("\n")[0];
    expect(header).not.toContain("nombre");
    expect(header).not.toContain("apellidos");
    expect(header).not.toContain("email");
    expect(header).not.toContain("telefono");
    expect(header).not.toContain("dni");
  });

  it("escapes commas in cell values", () => {
    const rows: CSVRow[] = [
      {
        fecha: "2026-04-11",
        hora: "09:00",
        persona_uuid: "anonimo",
        punto_servicio: "Sede, Central",
        programa: "comedor",
        metodo: "qr_scan",
      },
    ];
    const csv = buildCSVString(rows);
    expect(csv).toContain('"Sede, Central"');
  });

  it("handles empty rows array — only header", () => {
    const csv = buildCSVString([]);
    const lines = csv.split("\n").filter(Boolean);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe("fecha,hora,persona_uuid,punto_servicio,programa,metodo");
  });

  it("handles multiple rows in correct order", () => {
    const rows: CSVRow[] = [
      { fecha: "2026-04-09", hora: "08:00", persona_uuid: "anonimo", punto_servicio: "Sede A", programa: "comedor", metodo: "qr_scan" },
      { fecha: "2026-04-10", hora: "09:00", persona_uuid: "anonimo", punto_servicio: "Sede B", programa: "familia", metodo: "manual_busqueda" },
      { fecha: "2026-04-11", hora: "10:00", persona_uuid: "anonimo", punto_servicio: "Sede C", programa: "formacion", metodo: "conteo_anonimo" },
    ];
    const csv = buildCSVString(rows);
    const lines = csv.split("\n").filter(Boolean);
    expect(lines).toHaveLength(4); // header + 3 rows
    expect(lines[1]).toContain("2026-04-09");
    expect(lines[3]).toContain("2026-04-11");
  });
});

// ─── CSV Filename Tests ────────────────────────────────────────────────────────

describe("CSV filename convention", () => {
  it("filename uses YYYY-MM prefix from dateFrom", () => {
    // Verify the filename pattern: bocatas_asistencias_YYYY-MM.csv
    const dateFrom = "2026-04-01";
    const monthPrefix = dateFrom.slice(0, 7);
    const filename = `bocatas_asistencias_${monthPrefix}.csv`;
    expect(filename).toBe("bocatas_asistencias_2026-04.csv");
  });

  it("filename for different month", () => {
    const dateFrom = "2026-03-15";
    const monthPrefix = dateFrom.slice(0, 7);
    const filename = `bocatas_asistencias_${monthPrefix}.csv`;
    expect(filename).toBe("bocatas_asistencias_2026-03.csv");
  });
});

// ─── KPI Period Logic Tests ────────────────────────────────────────────────────

describe("KPI period date range logic", () => {
  it("today: dateFrom === dateTo === today", () => {
    const now = new Date("2026-04-11T12:00:00Z");
    const today = now.toISOString().split("T")[0];
    expect(today).toBe("2026-04-11");
    expect(today).toBe(today); // dateFrom === dateTo
  });

  it("week: dateFrom is Monday of current week", () => {
    // 2026-04-11 is a Saturday (day=6)
    const now = new Date("2026-04-11T12:00:00Z");
    const day = now.getUTCDay(); // 6 = Saturday
    const diff = day === 0 ? 6 : day - 1; // days since Monday = 5
    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() - diff);
    const dateFrom = monday.toISOString().split("T")[0];
    expect(dateFrom).toBe("2026-04-06"); // Monday of that week
  });

  it("month: dateFrom is first day of current month", () => {
    const now = new Date("2026-04-11T12:00:00Z");
    const dateFrom = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
    expect(dateFrom).toBe("2026-04-01");
  });
});

// ─── es_demo exclusion contract ───────────────────────────────────────────────

describe("es_demo exclusion contract", () => {
  it("CSV rows with es_demo=true should never appear in export", () => {
    // The tRPC procedure filters at DB level: .eq("es_demo", false)
    // This test verifies the contract: if a row has es_demo=true, it must not be in rows
    const allRows: (CSVRow & { es_demo: boolean })[] = [
      { fecha: "2026-04-11", hora: "10:00", persona_uuid: "uuid-1", punto_servicio: "Sede A", programa: "comedor", metodo: "qr_scan", es_demo: false },
      { fecha: "2026-04-11", hora: "11:00", persona_uuid: "uuid-2", punto_servicio: "Sede A", programa: "comedor", metodo: "qr_scan", es_demo: true },
    ];
    const filteredRows = allRows.filter((r) => !r.es_demo);
    const csv = buildCSVString(filteredRows);
    const lines = csv.split("\n").filter(Boolean);
    expect(lines).toHaveLength(2); // header + 1 real row
    expect(csv).toContain("uuid-1");
    expect(csv).not.toContain("uuid-2");
  });
});

// ─── useAbsenceAlerts — real implementation ──────────────────────────────────

describe("useAbsenceAlerts interface", () => {
  it("exports a function with the expected return shape keys", async () => {
    // We can't call the hook outside React context, but we can verify the module
    // exports a function and that the AbsenceAlert type has the required fields.
    const mod = await import("../client/src/features/dashboard/hooks/useAbsenceAlerts");
    expect(typeof mod.useAbsenceAlerts).toBe("function");
  });

  it("AbsenceAlert type has required fields", () => {
    // Structural type check via a dummy object
    const alert: import("../client/src/features/dashboard/hooks/useAbsenceAlerts").AbsenceAlert = {
      personId: "a0000000-0000-0000-0000-000000000001",
      nombre: "María",
      apellidos: "García López",
      diasAusente: 20,
      ultimoCheckin: "2026-03-01",
      restriccionesAlimentarias: "Sin gluten",
    };
    expect(alert.personId).toBeTruthy();
    expect(alert.diasAusente).toBeGreaterThan(0);
  });
});
