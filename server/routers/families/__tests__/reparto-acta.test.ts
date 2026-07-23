import { describe, it, expect } from "vitest";
import { buildRoundActa } from "../reparto-helpers";

// buildRoundActa takes the db client as a param, so we hand it a fake keyed by
// table. No signatures / no members needed for the ordering + date-resolution logic.
const S1 = "0be9a17e-0000-4000-8000-000000000001"; // 2026-08-05
const S2 = "0be9a17e-0000-4000-8000-000000000002"; // 2026-08-06

const tableResults: Record<string, { data: unknown; error: { message: string } | null }> = {
  delivery_round_assignments: {
    data: [
      // familia_numero inserted OUT of order (10,2,null,5) to prove numeric sort.
      { id: "aA", family_id: "fA", expediente: "10", assigned_day: "2026-08-05", turno: "manana", total_miembros: 3, kg_alimentos: null, kg_carne: null, preferred_slot_ids: [], attended_slot_id: null, attended: null, estado_contacto: "pendiente" },
      { id: "aB", family_id: "fB", expediente: "2", assigned_day: "2026-08-05", turno: "manana", total_miembros: 2, kg_alimentos: null, kg_carne: null, preferred_slot_ids: [S2], attended_slot_id: null, attended: null, estado_contacto: "confirmada" },
      { id: "aC", family_id: "fC", expediente: "7", assigned_day: "2026-08-05", turno: "manana", total_miembros: 1, kg_alimentos: null, kg_carne: null, preferred_slot_ids: [], attended_slot_id: S1, attended: true, estado_contacto: "pendiente" },
      { id: "aD", family_id: "fD", expediente: "5", assigned_day: "2026-08-05", turno: "manana", total_miembros: 4, kg_alimentos: null, kg_carne: null, preferred_slot_ids: [], attended_slot_id: S1, attended: false, estado_contacto: "pendiente" },
    ],
    error: null,
  },
  delivery_rounds: { data: { nombre: "Test", num_albaran_ba: null, num_factura_carne: null, logos: null, estado: "activa" }, error: null },
  delivery_round_slots: { data: [{ id: S1, slot_date: "2026-08-05" }, { id: S2, slot_date: "2026-08-06" }], error: null },
  familia_miembros: { data: [], error: null }, // resolveRepresentatives → empty
  families: {
    data: [
      { id: "fA", familia_numero: 10, num_adultos: 2, num_menores_18: 1 },
      { id: "fB", familia_numero: 2, num_adultos: 1, num_menores_18: 1 },
      { id: "fC", familia_numero: null, num_adultos: 1, num_menores_18: 0 },
      { id: "fD", familia_numero: 5, num_adultos: 3, num_menores_18: 1 },
    ],
    error: null,
  },
  reparto_signature_audit: { data: [], error: null },
};

function makeBuilder(table: string) {
  const read = () => tableResults[table] ?? { data: null, error: null };
  const b: Record<string, unknown> = {
    select: () => b, eq: () => b, in: () => b, is: () => b,
    single: async () => read(), maybeSingle: async () => read(),
    then: (r: (v: unknown) => unknown) => r(read()),
  };
  return b;
}
const db = {
  from: (t: string) => makeBuilder(t),
  storage: { from: () => ({ createSignedUrls: async () => ({ data: [] }) }) },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

describe("buildRoundActa", () => {
  it("orders rows by NUMERIC familia_numero (nulls last), not string/alpha", async () => {
    const acta = await buildRoundActa(db, "round-1");
    expect(acta.rows.map((r) => r.familia_numero)).toEqual([2, 5, 10, null]);
  });

  it("resolves fecha1/fecha2 from contacto and counts contactadas", async () => {
    const acta = await buildRoundActa(db, "round-1");
    const byNum = new Map(acta.rows.map((r) => [r.familia_numero, r]));
    // Uncontacted (fam 10): fecha1 falls back to assigned_day, fecha2 null, not contactada.
    expect(byNum.get(10)!.fecha1).toBe("2026-08-05");
    expect(byNum.get(10)!.fecha2).toBeNull();
    expect(byNum.get(10)!.contactada).toBe(false);
    // Contacted (fam 2): fecha1 from the preferred slot, contactada true.
    expect(byNum.get(2)!.fecha1).toBe("2026-08-06");
    expect(byNum.get(2)!.contactada).toBe(true);
    expect(acta.header.num_contactadas).toBe(1);
  });

  it("fecha_real is the pickup date for attended, and NULL for an AUSENTE family", async () => {
    const acta = await buildRoundActa(db, "round-1");
    const byNum = new Map(acta.rows.map((r) => [r.familia_numero, r]));
    // fam null = attended true in S1 → real pickup date.
    expect(byNum.get(null)!.fecha_real).toBe("2026-08-05");
    // fam 5 = attended=false (no-show) but attended_slot_id is stamped → must NOT
    // print a pickup date on the legal acta.
    expect(byNum.get(5)!.attended).toBe(false);
    expect(byNum.get(5)!.fecha_real).toBeNull();
  });

  it("throws (fails loudly) when the assignments query errors", async () => {
    const errDb = {
      from: (t: string) => {
        if (t === "delivery_round_assignments") {
          const b: Record<string, unknown> = { select: () => b, eq: () => b, in: () => b, is: () => b,
            single: async () => ({ data: null, error: { message: "boom" } }),
            then: (r: (v: unknown) => unknown) => r({ data: null, error: { message: "boom" } }) };
          return b;
        }
        return makeBuilder(t);
      },
      storage: { from: () => ({ createSignedUrls: async () => ({ data: [] }) }) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    await expect(buildRoundActa(errDb, "round-1")).rejects.toThrow(/assignments query failed/i);
  });
});
