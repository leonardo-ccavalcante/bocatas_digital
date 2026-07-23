// Tests for informeBulkData — fetchActiveFamiliesReadiness.
//
// Same hand-built chainable DB mock idiom as documentContextBuilder.test.ts:
// results are keyed by table; unmocked tables return an error, so these tests
// also prove exactly which tables the function touches.

import { describe, it, expect } from "vitest";
import type { createAdminClient } from "../../../client/src/lib/supabase/server";
import { fetchActiveFamiliesReadiness } from "../informeBulkData";

type Db = ReturnType<typeof createAdminClient>;
type TableResult = { data: unknown; error: null | { message: string } };

function buildDb(tables: Record<string, TableResult>): Db {
  return {
    from(table: string) {
      const result: TableResult = tables[table] ?? {
        data: null,
        error: { message: `No mock for table: ${table}` },
      };
      const terminal = Promise.resolve(result);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function makeProxy(): any {
        return new Proxy(
          {},
          {
            get(_target, prop: string) {
              if (prop === "then") return terminal.then.bind(terminal);
              if (prop === "catch") return terminal.catch.bind(terminal);
              if (prop === "finally") return terminal.finally.bind(terminal);
              if (prop === "single" || prop === "maybeSingle") {
                return () => Promise.resolve(result);
              }
              return () => makeProxy();
            },
          }
        );
      }

      return makeProxy();
    },
  } as unknown as Db;
}

const TITULAR = { nombre: "María", apellidos: "García", numero_documento: "X1" };

function familyRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    familia_numero: 7,
    titular_id: "t-1",
    situacion_familiar_texto: "Situación completa.",
    informe_social_fecha: null,
    persons: TITULAR,
    ...overrides,
  };
}

const BASE_TABLES = {
  family_follow_ups: { data: [], error: null },
  familia_miembros: { data: [], error: null },
  family_member_documents: { data: [], error: null },
} satisfies Record<string, TableResult>;

describe("fetchActiveFamiliesReadiness — ADR-0014 prior-informe signal", () => {
  it("first informe: family with NO informe doc row and NO follow-up is READY", async () => {
    const db = buildDb({
      families: { data: [familyRow("fam-1")], error: null },
      ...BASE_TABLES,
    });

    const rows = await fetchActiveFamiliesReadiness(db);

    expect(rows).toHaveLength(1);
    expect(rows[0].readiness).toEqual({ ready: true });
  });

  it("renovación: family WITH a current informe doc row and NO follow-up is SIN_SEGUIMIENTO", async () => {
    const db = buildDb({
      families: { data: [familyRow("fam-1")], error: null },
      ...BASE_TABLES,
      family_member_documents: { data: [{ family_id: "fam-1" }], error: null },
    });

    const rows = await fetchActiveFamiliesReadiness(db);

    expect(rows[0].readiness).toEqual({ ready: false, reason: "SIN_SEGUIMIENTO" });
  });

  it("fails loudly when the informe-docs query errors (never a silent gate waiver)", async () => {
    const db = buildDb({
      families: { data: [familyRow("fam-1")], error: null },
      ...BASE_TABLES,
      family_member_documents: { data: null, error: { message: "boom" } },
    });

    await expect(fetchActiveFamiliesReadiness(db)).rejects.toThrow(/informe docs fetch failed/);
  });

  it("policy boundary: manual recent informe_social_fecha with NO doc row is skipped as INFORME_AL_DIA", async () => {
    // Documented ADR-0014 boundary: the gate treats this family as "first
    // informe" (individual generation allowed), but the bulk cadence policy
    // honors the operator-recorded fecha and leaves the family untouched.
    const recent = new Date().toISOString().slice(0, 10);
    const db = buildDb({
      families: { data: [familyRow("fam-1", { informe_social_fecha: recent })], error: null },
      ...BASE_TABLES,
    });

    const rows = await fetchActiveFamiliesReadiness(db);

    expect(rows[0].readiness).toEqual({ ready: false, reason: "INFORME_AL_DIA" });
  });
});
