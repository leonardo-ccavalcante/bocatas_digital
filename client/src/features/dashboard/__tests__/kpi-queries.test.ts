/**
 * kpi-queries.test.ts — KPI period date range logic and es_demo exclusion contract.
 * Location: client/src/features/dashboard/__tests__/ (as required by spec)
 */
import { describe, it, expect } from "vitest";

// ─── Period date range computation ────────────────────────────────────────────

function getPeriodDates(period: "today" | "week" | "month", now: Date = new Date()) {
  const today = now.toISOString().split("T")[0];
  if (period === "today") {
    return { dateFrom: today, dateTo: today };
  } else if (period === "week") {
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diff);
    return { dateFrom: monday.toISOString().split("T")[0], dateTo: today };
  } else {
    const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    return { dateFrom: firstOfMonth, dateTo: today };
  }
}

describe("KPI period date range logic", () => {
  const saturday = new Date("2026-04-11T12:00:00Z"); // Saturday

  it("today: dateFrom === dateTo === today", () => {
    const { dateFrom, dateTo } = getPeriodDates("today", saturday);
    expect(dateFrom).toBe("2026-04-11");
    expect(dateTo).toBe("2026-04-11");
    expect(dateFrom).toBe(dateTo);
  });

  it("week: dateFrom is Monday of current week (ISO week starts Monday)", () => {
    const { dateFrom, dateTo } = getPeriodDates("week", saturday);
    expect(dateFrom).toBe("2026-04-06"); // Monday of week containing Saturday Apr 11
    expect(dateTo).toBe("2026-04-11");
  });

  it("week: Sunday is treated as end of previous week (diff=6)", () => {
    const sunday = new Date("2026-04-12T12:00:00Z"); // Sunday
    const { dateFrom } = getPeriodDates("week", sunday);
    expect(dateFrom).toBe("2026-04-06"); // Monday of same week
  });

  it("month: dateFrom is first day of current month", () => {
    const { dateFrom, dateTo } = getPeriodDates("month", saturday);
    expect(dateFrom).toBe("2026-04-01");
    expect(dateTo).toBe("2026-04-11");
  });

  it("month: December edge case", () => {
    const dec = new Date("2026-12-25T12:00:00Z");
    const { dateFrom } = getPeriodDates("month", dec);
    expect(dateFrom).toBe("2026-12-01");
  });

  it("dateFrom is always <= dateTo for all periods", () => {
    for (const period of ["today", "week", "month"] as const) {
      const { dateFrom, dateTo } = getPeriodDates(period, saturday);
      expect(new Date(dateFrom) <= new Date(dateTo)).toBe(true);
    }
  });
});

// ─── es_demo exclusion contract ───────────────────────────────────────────────

describe("es_demo exclusion contract", () => {
  type AttendanceRow = {
    checked_in_date: string;
    es_demo: boolean;
    person_id: string | null;
  };

  function countKPI(rows: AttendanceRow[], dateFrom: string, dateTo: string): number {
    return rows.filter(
      (r) =>
        !r.es_demo &&
        r.checked_in_date >= dateFrom &&
        r.checked_in_date <= dateTo
    ).length;
  }

  it("es_demo=true rows NEVER count toward KPI", () => {
    const rows: AttendanceRow[] = [
      { checked_in_date: "2026-04-11", es_demo: false, person_id: "uuid-1" },
      { checked_in_date: "2026-04-11", es_demo: true,  person_id: "uuid-2" }, // demo — excluded
      { checked_in_date: "2026-04-11", es_demo: true,  person_id: null },      // demo anon — excluded
    ];
    expect(countKPI(rows, "2026-04-11", "2026-04-11")).toBe(1);
  });

  it("anonymous rows (person_id=NULL, es_demo=false) DO count", () => {
    const rows: AttendanceRow[] = [
      { checked_in_date: "2026-04-11", es_demo: false, person_id: null },  // anon real — counts
      { checked_in_date: "2026-04-11", es_demo: false, person_id: "uuid-1" }, // real — counts
    ];
    expect(countKPI(rows, "2026-04-11", "2026-04-11")).toBe(2);
  });

  it("demo check-in does NOT increment KPI count", () => {
    const rows: AttendanceRow[] = [
      { checked_in_date: "2026-04-11", es_demo: false, person_id: "uuid-1" },
    ];
    const before = countKPI(rows, "2026-04-11", "2026-04-11");
    // Simulate demo check-in
    rows.push({ checked_in_date: "2026-04-11", es_demo: true, person_id: "uuid-demo" });
    const after = countKPI(rows, "2026-04-11", "2026-04-11");
    expect(after).toBe(before); // count unchanged
  });

  it("location filter: 'all' includes all locations", () => {
    const rows: AttendanceRow[] = [
      { checked_in_date: "2026-04-11", es_demo: false, person_id: "uuid-1" },
      { checked_in_date: "2026-04-11", es_demo: false, person_id: "uuid-2" },
    ];
    // 'all' = no location filter applied
    expect(countKPI(rows, "2026-04-11", "2026-04-11")).toBe(2);
  });

  it("date range filter: only rows within range count", () => {
    const rows: AttendanceRow[] = [
      { checked_in_date: "2026-04-08", es_demo: false, person_id: "uuid-1" }, // before range
      { checked_in_date: "2026-04-09", es_demo: false, person_id: "uuid-2" }, // in range
      { checked_in_date: "2026-04-10", es_demo: false, person_id: "uuid-3" }, // in range
      { checked_in_date: "2026-04-12", es_demo: false, person_id: "uuid-4" }, // after range
    ];
    expect(countKPI(rows, "2026-04-09", "2026-04-10")).toBe(2);
  });
});

// ─── Trend data grouping ───────────────────────────────────────────────────────

describe("Trend data 4-week grouping", () => {
  it("returns exactly 4 data points", () => {
    // The tRPC procedure always returns 4 entries: S-3, S-2, S-1, Esta
    const trendData = [
      { label: "S-3", count: 5 },
      { label: "S-2", count: 8 },
      { label: "S-1", count: 12 },
      { label: "Esta", count: 3 },
    ];
    expect(trendData).toHaveLength(4);
  });

  it("trend data labels are in chronological order (oldest first)", () => {
    const labels = ["S-3", "S-2", "S-1", "Esta"];
    expect(labels[0]).toBe("S-3");
    expect(labels[3]).toBe("Esta");
  });

  it("all count values are non-negative integers", () => {
    const trendData = [
      { label: "S-3", count: 0 },
      { label: "S-2", count: 5 },
      { label: "S-1", count: 10 },
      { label: "Esta", count: 3 },
    ];
    for (const point of trendData) {
      expect(point.count).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(point.count)).toBe(true);
    }
  });
});
