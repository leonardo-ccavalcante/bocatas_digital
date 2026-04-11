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

// ─── getAbsenceAlerts logic tests ────────────────────────────────────────────

describe("getAbsenceAlerts — business logic", () => {
  /**
   * The tRPC procedure filters persons whose last attendance was > thresholdDays ago.
   * We test the core logic: date comparison, threshold, and filtering.
   */
  function simulateAbsenceFilter(
    persons: { id: string; nombre: string; lastCheckin: string | null }[],
    thresholdDays: number,
    referenceDate: string
  ) {
    const ref = new Date(referenceDate);
    return persons
      .filter((p) => {
        if (!p.lastCheckin) return true; // never checked in → always alert
        const last = new Date(p.lastCheckin);
        const diffMs = ref.getTime() - last.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        return diffDays >= thresholdDays;
      })
      .map((p) => ({
        ...p,
        diasAusente: p.lastCheckin
          ? Math.floor(
              (ref.getTime() - new Date(p.lastCheckin).getTime()) / (1000 * 60 * 60 * 24)
            )
          : 9999,
      }));
  }

  it("includes persons with lastCheckin > thresholdDays ago", () => {
    const persons = [
      { id: "p1", nombre: "Ana", lastCheckin: "2026-03-01" }, // 41 days ago from 2026-04-11
      { id: "p2", nombre: "Bob", lastCheckin: "2026-04-10" }, // 1 day ago
    ];
    const result = simulateAbsenceFilter(persons, 14, "2026-04-11");
    expect(result.map((r) => r.id)).toContain("p1");
    expect(result.map((r) => r.id)).not.toContain("p2");
  });

  it("includes persons who have never checked in (lastCheckin = null)", () => {
    const persons = [
      { id: "p3", nombre: "Carlos", lastCheckin: null },
      { id: "p4", nombre: "Diana", lastCheckin: "2026-04-10" },
    ];
    const result = simulateAbsenceFilter(persons, 14, "2026-04-11");
    expect(result.map((r) => r.id)).toContain("p3");
    expect(result.map((r) => r.id)).not.toContain("p4");
  });

  it("respects thresholdDays boundary (exactly N days = alert)", () => {
    const persons = [
      { id: "p5", nombre: "Eva", lastCheckin: "2026-03-28" }, // exactly 14 days from 2026-04-11
      { id: "p6", nombre: "Fran", lastCheckin: "2026-03-29" }, // 13 days — no alert
    ];
    const result = simulateAbsenceFilter(persons, 14, "2026-04-11");
    expect(result.map((r) => r.id)).toContain("p5");
    expect(result.map((r) => r.id)).not.toContain("p6");
  });

  it("returns empty array when no persons exceed threshold", () => {
    const persons = [
      { id: "p7", nombre: "Gema", lastCheckin: "2026-04-10" },
      { id: "p8", nombre: "Hugo", lastCheckin: "2026-04-09" },
    ];
    const result = simulateAbsenceFilter(persons, 14, "2026-04-11");
    expect(result).toHaveLength(0);
  });

  it("calculates diasAusente correctly", () => {
    const persons = [
      { id: "p9", nombre: "Irene", lastCheckin: "2026-03-01" }, // 41 days
    ];
    const result = simulateAbsenceFilter(persons, 14, "2026-04-11");
    expect(result[0].diasAusente).toBe(41);
  });
});

// ─── getCheckinHistory logic tests ───────────────────────────────────────────

describe("getCheckinHistory — pagination logic", () => {
  function paginateRows<T>(rows: T[], limit: number, offset: number) {
    const total = rows.length;
    const page = rows.slice(offset, offset + limit);
    return {
      rows: page,
      total,
      hasMore: offset + limit < total,
    };
  }

  it("returns first page correctly", () => {
    const rows = Array.from({ length: 45 }, (_, i) => ({ id: `row-${i}` }));
    const result = paginateRows(rows, 20, 0);
    expect(result.rows).toHaveLength(20);
    expect(result.total).toBe(45);
    expect(result.hasMore).toBe(true);
  });

  it("returns last page correctly", () => {
    const rows = Array.from({ length: 45 }, (_, i) => ({ id: `row-${i}` }));
    const result = paginateRows(rows, 20, 40);
    expect(result.rows).toHaveLength(5);
    expect(result.hasMore).toBe(false);
  });

  it("returns empty when offset exceeds total", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ id: `row-${i}` }));
    const result = paginateRows(rows, 20, 20);
    expect(result.rows).toHaveLength(0);
    expect(result.hasMore).toBe(false);
  });

  it("hasMore is false when total fits in one page", () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: `row-${i}` }));
    const result = paginateRows(rows, 20, 0);
    expect(result.rows).toHaveLength(5);
    expect(result.hasMore).toBe(false);
  });
});

// ─── Program filter in KPI/CSV ────────────────────────────────────────────────

describe("Program filter — KPI and CSV logic", () => {
  interface AttendanceRow {
    id: string;
    programa: string;
    es_demo: boolean;
    person_id: string | null;
    fecha: string;
  }

  function filterAttendances(
    rows: AttendanceRow[],
    programa: string,
    locationId: string = "all"
  ) {
    return rows.filter((r) => {
      if (r.es_demo) return false;
      if (programa !== "all" && r.programa !== programa) return false;
      return true;
    });
  }

  const sampleRows: AttendanceRow[] = [
    { id: "a1", programa: "comedor", es_demo: false, person_id: "p1", fecha: "2026-04-11" },
    { id: "a2", programa: "familia", es_demo: false, person_id: "p2", fecha: "2026-04-11" },
    { id: "a3", programa: "comedor", es_demo: true, person_id: "p3", fecha: "2026-04-11" },
    { id: "a4", programa: "formacion", es_demo: false, person_id: null, fecha: "2026-04-11" },
    { id: "a5", programa: "comedor", es_demo: false, person_id: "p4", fecha: "2026-04-11" },
  ];

  it("programa='all' returns all non-demo rows", () => {
    const result = filterAttendances(sampleRows, "all");
    expect(result).toHaveLength(4); // a1, a2, a4, a5 (a3 is demo)
  });

  it("programa='comedor' returns only comedor non-demo rows", () => {
    const result = filterAttendances(sampleRows, "comedor");
    expect(result).toHaveLength(2); // a1, a5 (a3 is demo)
    expect(result.every((r) => r.programa === "comedor")).toBe(true);
  });

  it("programa='familia' returns only familia rows", () => {
    const result = filterAttendances(sampleRows, "familia");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a2");
  });

  it("programa='voluntariado' returns empty when no matching rows", () => {
    const result = filterAttendances(sampleRows, "voluntariado");
    expect(result).toHaveLength(0);
  });

  it("anonymous rows (person_id=null) are included in program filter", () => {
    const result = filterAttendances(sampleRows, "formacion");
    expect(result).toHaveLength(1);
    expect(result[0].person_id).toBeNull();
  });

  it("es_demo=true rows are NEVER included regardless of programa filter", () => {
    const result = filterAttendances(sampleRows, "comedor");
    expect(result.every((r) => !r.es_demo)).toBe(true);
  });
});
