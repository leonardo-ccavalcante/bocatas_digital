// Tests for documentContextBuilder — buildFamilyDataContext.
//
// Uses a hand-built chainable DB mock (no module mock needed — db is passed in).
// Column names match database.types.ts exactly.

import { describe, it, expect } from "vitest";
import { TRPCError } from "@trpc/server";
import type { createAdminClient } from "../../../client/src/lib/supabase/server";
import { buildFamilyDataContext } from "../documentContextBuilder";

// ── Type alias ────────────────────────────────────────────────────────────────

type Db = ReturnType<typeof createAdminClient>;

// ── Shared fixtures ──────────────────────────────────────────────────────────

const FAMILY_UUID = "fam-uuid-0001";
const SESSION_UUID = "sess-uuid-0001";

const TITULAR_ROW = {
  nombre: "María",
  apellidos: "García López",
  numero_documento: "X1234567A",
  telefono: "600000000",
};

const FAMILY_ROW = {
  id: FAMILY_UUID,
  familia_numero: 42,
  num_adultos: 2,
  num_menores_18: 1,
  distrito: "Centro",
  codigo_postal: "28001",
  estado: "activa",
  persons: TITULAR_ROW, // singular join result (non-array)
};

const MIEMBRO_ROW = {
  nombre: "Ahmed",
  apellidos: "García",
  relacion: "hijo",
  fecha_nacimiento: "2018-03-15",
};

const FOLLOW_UP_1 = { fecha: "2026-05-01", notas: "Visita OK" };
const FOLLOW_UP_2 = { fecha: "2026-04-01", notas: "Seguimiento mensual" };
const FOLLOW_UP_3 = { fecha: "2026-03-01", notas: "Primera visita" };
const FOLLOW_UP_4 = { fecha: "2026-02-01", notas: "Visita antigua" }; // must not appear

const SESSION_ROW = {
  id: SESSION_UUID,
  fecha: "2026-05-20",
  session_data: {
    rates: {
      per_member_rate_fyh: 3.0,
      per_member_rate_carne: 2.5,
      per_member_rate_infantil: 1.5,
      per_member_rate_unidades: 1.0,
    },
    albaran_entrada: "ALB-001",
    numero_factura_carne: "FAC-042",
    codigo_consumo: "CC-001",
    mes_fecha: "Mayo 2026",
  },
};

const DELIVERY_ROW = {
  family_id: FAMILY_UUID,
  fecha_entrega: "2026-05-20",
  families: {
    id: FAMILY_UUID,
    familia_numero: 42,
    num_adultos: 2,
    num_menores_18: 1,
    persons: TITULAR_ROW,
  },
};

// ── Chainable mock builder ────────────────────────────────────────────────────

/**
 * buildDb — creates a minimal fake Supabase client.
 *
 * Each query chain terminates via .single() or as a plain Promise (for
 * select chains with .order().limit()).  We intercept every call with a
 * Proxy that returns the final result at any terminal point.
 *
 * Cast via `as unknown as Db` — the structural mismatch is intentional;
 * we only exercise the `from(table).select(...).eq(...).is(...).*` paths.
 */
type TableResult = { data: unknown; error: null | { message: string } };
type RecordedCall = { method: string; args: unknown[] };

function buildDb(
  tables: Record<string, TableResult>,
  calls?: Record<string, RecordedCall[]>
): Db {
  return {
    from(table: string) {
      const result: TableResult = tables[table] ?? {
        data: null,
        error: { message: `No mock for table: ${table}` },
      };
      const terminal = Promise.resolve(result);
      const log = calls ? (calls[table] ??= []) : null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function makeProxy(): any {
        return new Proxy(
          {},
          {
            get(_target, prop: string) {
              // Promise protocol
              if (prop === "then") return terminal.then.bind(terminal);
              if (prop === "catch") return terminal.catch.bind(terminal);
              if (prop === "finally") return terminal.finally.bind(terminal);
              // Terminal methods
              if (prop === "single" || prop === "maybeSingle") {
                return () => Promise.resolve(result);
              }
              // Any chainable query builder method → same proxy (recorded)
              return (...args: unknown[]) => {
                log?.push({ method: prop, args });
                return makeProxy();
              };
            },
          }
        );
      }

      return makeProxy();
    },
  } as unknown as Db;
}

// ── Test: family not found ────────────────────────────────────────────────────

describe("buildFamilyDataContext — family not found", () => {
  it("throws NOT_FOUND when the family row is null", async () => {
    const db = buildDb({
      families: { data: null, error: null },
    });

    await expect(
      buildFamilyDataContext(db, FAMILY_UUID)
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Familia no encontrada",
    });
  });

  it("throws NOT_FOUND when the families query returns an error", async () => {
    const db = buildDb({
      families: { data: null, error: { message: "db error" } },
    });

    await expect(
      buildFamilyDataContext(db, FAMILY_UUID)
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

// ── Test: informe_social ──────────────────────────────────────────────────────

describe("buildFamilyDataContext — informe_social", () => {
  it("includes only the last 3 follow-ups in notas_seguimiento", async () => {
    const db = buildDb({
      families: { data: FAMILY_ROW, error: null },
      familia_miembros: { data: [MIEMBRO_ROW], error: null },
      // Mock returns top-3 (limit is applied by real DB; mock returns exactly 3)
      family_follow_ups: {
        data: [FOLLOW_UP_1, FOLLOW_UP_2, FOLLOW_UP_3],
        error: null,
      },
      family_member_documents: { data: [], error: null },
    });

    const ctx = await buildFamilyDataContext(db, FAMILY_UUID, { slug: "informe_social" });

    expect(ctx.informe?.notas_seguimiento).toBe(
      [FOLLOW_UP_1.notas, FOLLOW_UP_2.notas, FOLLOW_UP_3.notas].join("\n")
    );
    // FOLLOW_UP_4 must not appear
    expect(ctx.informe?.notas_seguimiento).not.toContain(FOLLOW_UP_4.notas);
    expect(ctx.informe?.fecha_seguimiento).toBe(FOLLOW_UP_1.fecha);
  });

  it("sets fecha_seguimiento to empty string when there are zero follow-ups", async () => {
    const db = buildDb({
      families: { data: FAMILY_ROW, error: null },
      familia_miembros: { data: [], error: null },
      family_follow_ups: { data: [], error: null },
      family_member_documents: { data: [], error: null },
    });

    const ctx = await buildFamilyDataContext(db, FAMILY_UUID, { slug: "informe_social" });

    expect(ctx.informe?.fecha_seguimiento).toBe("");
    expect(ctx.informe?.effective_date).toBe("");
    expect(ctx.informe?.notas_seguimiento).toBe("");
    expect(ctx.informe?.has_informe_previo).toBe(false);
  });

  it("sets has_informe_previo=true when a current informe document row exists", async () => {
    const db = buildDb({
      families: { data: FAMILY_ROW, error: null },
      familia_miembros: { data: [], error: null },
      family_follow_ups: { data: [], error: null },
      family_member_documents: { data: [{ id: "doc-uuid-1" }], error: null },
    });

    const ctx = await buildFamilyDataContext(db, FAMILY_UUID, { slug: "informe_social" });

    expect(ctx.informe?.has_informe_previo).toBe(true);
  });

  it("pins the ADR-0014 prior-informe filter chain (member -1, both tipos, current, not deleted, has URL)", async () => {
    const calls: Record<string, RecordedCall[]> = {};
    const db = buildDb(
      {
        families: { data: FAMILY_ROW, error: null },
        familia_miembros: { data: [], error: null },
        family_follow_ups: { data: [], error: null },
        family_member_documents: { data: [], error: null },
      },
      calls
    );

    await buildFamilyDataContext(db, FAMILY_UUID, { slug: "informe_social" });

    const chain = (calls.family_member_documents ?? []).map((c) => [c.method, ...c.args]);
    expect(chain).toEqual(
      expect.arrayContaining([
        ["eq", "family_id", FAMILY_UUID],
        ["eq", "member_index", -1],
        ["in", "documento_tipo", ["informe_valoracion_social", "informe_social"]],
        ["eq", "is_current", true],
        ["is", "deleted_at", null],
        ["not", "documento_url", "is", null],
      ])
    );
  });

  it("throws INTERNAL_SERVER_ERROR when the follow-ups fetch fails (never a silent first informe)", async () => {
    const db = buildDb({
      families: { data: FAMILY_ROW, error: null },
      familia_miembros: { data: [], error: null },
      family_follow_ups: { data: null, error: { message: "transient" } },
      family_member_documents: { data: [], error: null },
    });

    await expect(
      buildFamilyDataContext(db, FAMILY_UUID, { slug: "informe_social" })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("throws INTERNAL_SERVER_ERROR when the informe-previo lookup fails (never silent false)", async () => {
    const db = buildDb({
      families: { data: FAMILY_ROW, error: null },
      familia_miembros: { data: [], error: null },
      family_follow_ups: { data: [], error: null },
      family_member_documents: { data: null, error: { message: "boom" } },
    });

    await expect(
      buildFamilyDataContext(db, FAMILY_UUID, { slug: "informe_social" })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("derivacion: skips the informe-previo lookup and hardcodes has_informe_previo=false", async () => {
    // No family_member_documents mock on purpose: buildDb errors on unmocked
    // tables, so this test proves derivación never runs the doc query.
    const db = buildDb({
      families: { data: FAMILY_ROW, error: null },
      familia_miembros: { data: [], error: null },
      family_follow_ups: { data: [FOLLOW_UP_1], error: null },
    });

    const ctx = await buildFamilyDataContext(db, FAMILY_UUID, { slug: "derivacion" });

    expect(ctx.informe?.has_informe_previo).toBe(false);
  });

  it("populates titular from persons join using numero_documento", async () => {
    const db = buildDb({
      families: { data: FAMILY_ROW, error: null },
      familia_miembros: { data: [], error: null },
      family_follow_ups: { data: [FOLLOW_UP_1], error: null },
      family_member_documents: { data: [], error: null },
    });

    const ctx = await buildFamilyDataContext(db, FAMILY_UUID);

    expect(ctx.titular.nombre).toBe(TITULAR_ROW.nombre);
    expect(ctx.titular.apellidos).toBe(TITULAR_ROW.apellidos);
    expect(ctx.titular.documento).toBe(TITULAR_ROW.numero_documento);
    expect(ctx.titular.telefono).toBe(TITULAR_ROW.telefono);
  });

  it("populates familia block with zero-padded numero and correct counts", async () => {
    const db = buildDb({
      families: { data: FAMILY_ROW, error: null },
      familia_miembros: { data: [], error: null },
      family_follow_ups: { data: [FOLLOW_UP_1], error: null },
      family_member_documents: { data: [], error: null },
    });

    const ctx = await buildFamilyDataContext(db, FAMILY_UUID);

    expect(ctx.familia.numero).toBe("0042");
    expect(ctx.familia.num_adultos).toBe(2);
    expect(ctx.familia.num_menores_18).toBe(1);
    expect(ctx.familia.total_miembros).toBe(3);
    expect(ctx.familia.estado).toBe("activa");
  });

  it("populates miembros using relacion column as parentesco", async () => {
    const db = buildDb({
      families: { data: FAMILY_ROW, error: null },
      familia_miembros: { data: [MIEMBRO_ROW], error: null },
      family_follow_ups: { data: [FOLLOW_UP_1], error: null },
      family_member_documents: { data: [], error: null },
    });

    const ctx = await buildFamilyDataContext(db, FAMILY_UUID);

    expect(ctx.miembros).toHaveLength(1);
    expect(ctx.miembros[0].parentesco).toBe("hijo");
    expect(ctx.miembros[0].nombre).toBe("Ahmed");
    expect(ctx.miembros[0].fecha_nacimiento).toBe("2018-03-15");
  });

  it("sets logos, static_blocks, and generated_by_name defaults", async () => {
    const db = buildDb({
      families: { data: FAMILY_ROW, error: null },
      familia_miembros: { data: [], error: null },
      family_follow_ups: { data: [FOLLOW_UP_1], error: null },
      family_member_documents: { data: [], error: null },
    });

    const ctx = await buildFamilyDataContext(db, FAMILY_UUID);

    expect(ctx.logos).toEqual([]);
    expect(ctx.static_blocks).toEqual({});
    expect(ctx.generated_by_name).toBe("");
    expect(typeof ctx.generated_at).toBe("string");
  });
});

// ── Test: informe valoración social — extended fields ─────────────────────────

describe("buildFamilyDataContext — informe valoración fields", () => {
  it("maps pais (ISO-2→ES), fecha_nacimiento, direccion, fecha_alta, valoracion, member numero+documento", async () => {
    const db = buildDb({
      families: {
        data: {
          ...FAMILY_ROW,
          fecha_alta: "2026-01-15",
          situacion_familiar_texto: "Situación de prueba",
          persons: {
            ...TITULAR_ROW,
            pais_origen: "PE",
            fecha_nacimiento: "1985-07-20",
            direccion: "Calle Falsa 1",
          },
        },
        error: null,
      },
      familia_miembros: { data: [{ ...MIEMBRO_ROW, documento: "M-123" }], error: null },
      family_follow_ups: { data: [FOLLOW_UP_1], error: null },
      family_member_documents: { data: [], error: null },
    });

    const ctx = await buildFamilyDataContext(db, FAMILY_UUID, { slug: "informe_social" });

    expect(ctx.titular.pais).toBe("Perú"); // ISO-2 → Spanish
    expect(ctx.titular.fecha_nacimiento).toBe("1985-07-20");
    expect(ctx.titular.direccion).toBe("Calle Falsa 1");
    expect(ctx.familia.fecha_alta).toBe("2026-01-15");
    expect(ctx.valoracion).toBe("Situación de prueba");
    expect(ctx.miembros[0].numero).toBe(2); // dependents numbered from 2
    expect(ctx.miembros[0].documento).toBe("M-123");
  });

  it("blanks the extended fields (never undefined) when the DB columns are null", async () => {
    const db = buildDb({
      families: { data: FAMILY_ROW, error: null }, // no fecha_alta / situacion_familiar_texto / extra person cols
      familia_miembros: { data: [MIEMBRO_ROW], error: null },
      family_follow_ups: { data: [FOLLOW_UP_1], error: null },
      family_member_documents: { data: [], error: null },
    });

    const ctx = await buildFamilyDataContext(db, FAMILY_UUID, { slug: "informe_social" });

    expect(ctx.titular.pais).toBe("");
    expect(ctx.titular.direccion).toBe("");
    expect(ctx.familia.fecha_alta).toBe("");
    expect(ctx.valoracion).toBe("");
    expect(ctx.miembros[0].documento).toBe("");
  });
});

// ── Test: nota_entrega ────────────────────────────────────────────────────────

describe("buildFamilyDataContext — nota_entrega", () => {
  it("throws NOT_FOUND when session is missing", async () => {
    const db = buildDb({
      families: { data: FAMILY_ROW, error: null },
      familia_miembros: { data: [], error: null },
      program_sessions: { data: null, error: null },
    });

    await expect(
      buildFamilyDataContext(db, FAMILY_UUID, { slug: "nota_entrega", programSessionId: SESSION_UUID })
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "Sesión de entrega no encontrada" });
  });

  it("throws BAD_REQUEST when programSessionId is not provided", async () => {
    const db = buildDb({
      families: { data: FAMILY_ROW, error: null },
      familia_miembros: { data: [], error: null },
    });

    await expect(
      buildFamilyDataContext(db, FAMILY_UUID, { slug: "nota_entrega" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("returns round.rows with kg computed correctly via computeDeliveryRow", async () => {
    const db = buildDb({
      families: { data: FAMILY_ROW, error: null },
      familia_miembros: { data: [], error: null },
      program_sessions: { data: SESSION_ROW, error: null },
      deliveries: { data: [DELIVERY_ROW], error: null },
    });

    const ctx = await buildFamilyDataContext(db, FAMILY_UUID, {
      slug: "nota_entrega",
      programSessionId: SESSION_UUID,
    });

    expect(ctx.round).toBeDefined();
    expect(ctx.round!.rows).toHaveLength(1);

    const row = ctx.round!.rows[0];
    const totalMiembros = FAMILY_ROW.num_adultos + FAMILY_ROW.num_menores_18; // 3
    const rates = SESSION_ROW.session_data.rates;

    // computeDeliveryRow formula: per_member_rate_carne * total_miembros
    expect(row.kg_carne).toBe(rates.per_member_rate_carne * totalMiembros); // 2.5 * 3 = 7.5
    expect(row.kg_frutas_hortalizas).toBe(rates.per_member_rate_fyh * totalMiembros); // 3.0 * 3 = 9.0
    expect(row.kg_infantil).toBe(rates.per_member_rate_infantil * FAMILY_ROW.num_menores_18); // 1.5 * 1 = 1.5
    expect(row.unidades_no_alimentacion).toBe(rates.per_member_rate_unidades * totalMiembros); // 1.0 * 3 = 3.0
  });

  it("sets round.header totals as sums of all rows", async () => {
    const db = buildDb({
      families: { data: FAMILY_ROW, error: null },
      familia_miembros: { data: [], error: null },
      program_sessions: { data: SESSION_ROW, error: null },
      deliveries: { data: [DELIVERY_ROW, DELIVERY_ROW], error: null },
    });

    const ctx = await buildFamilyDataContext(db, FAMILY_UUID, {
      slug: "nota_entrega",
      programSessionId: SESSION_UUID,
    });

    expect(ctx.round!.header.total_familias).toBe(2);
    expect(ctx.round!.header.total_kg_carne).toBeCloseTo(7.5 * 2);
    expect(ctx.round!.header.albaran_entrada).toBe("ALB-001");
    expect(ctx.round!.header.mes_fecha).toBe("Mayo 2026");
    expect(ctx.round!.header.per_member_rate_carne).toBe(2.5);
  });

  it("defaults missing rates to 0 when session_data has no rates key", async () => {
    const sessionNoRates = { ...SESSION_ROW, session_data: {} };

    const db = buildDb({
      families: { data: FAMILY_ROW, error: null },
      familia_miembros: { data: [], error: null },
      program_sessions: { data: sessionNoRates, error: null },
      deliveries: { data: [DELIVERY_ROW], error: null },
    });

    const ctx = await buildFamilyDataContext(db, FAMILY_UUID, {
      slug: "nota_entrega",
      programSessionId: SESSION_UUID,
    });

    expect(ctx.round!.rows[0].kg_carne).toBe(0);
    expect(ctx.round!.rows[0].kg_frutas_hortalizas).toBe(0);
  });

  it("does not populate informe block for nota_entrega", async () => {
    const db = buildDb({
      families: { data: FAMILY_ROW, error: null },
      familia_miembros: { data: [], error: null },
      program_sessions: { data: SESSION_ROW, error: null },
      deliveries: { data: [DELIVERY_ROW], error: null },
    });

    const ctx = await buildFamilyDataContext(db, FAMILY_UUID, {
      slug: "nota_entrega",
      programSessionId: SESSION_UUID,
    });

    expect(ctx.informe).toBeUndefined();
  });
});

// ── Test: TRPCError shape ─────────────────────────────────────────────────────

describe("buildFamilyDataContext — error shape", () => {
  it("throws an instance of TRPCError for NOT_FOUND family", async () => {
    const db = buildDb({
      families: { data: null, error: null },
    });

    let thrown: unknown;
    try {
      await buildFamilyDataContext(db, FAMILY_UUID);
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(TRPCError);
    expect((thrown as TRPCError).code).toBe("NOT_FOUND");
  });
});
