/**
 * consentsPorNombre.test.ts — «tengo 7 nombres para un cartel, ¿puedo
 * publicar sus caras?». Resolver real vía createCaller con createAdminClient
 * mockeado (patrón de qr.getQrPayload.test.ts).
 *
 * Lo que se bloquea aquí: que una revocación cuente como un «sí», y que un
 * nombre repetido se resuelva adivinando la primera fila.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  persons: [] as Array<Record<string, unknown>>,
  consents: [] as Array<Record<string, unknown>>,
}));

vi.mock("../../../../client/src/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: (tabla: "persons" | "consents") => {
      const filtros: Array<(r: Record<string, unknown>) => boolean> = [];
      // test mock boundary — chainable Supabase query builder
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {
        select: () => chain,
        in: (col: string, vals: unknown[]) => {
          filtros.push((r) => vals.includes(r[col]));
          return chain;
        },
        eq: (col: string, val: unknown) => {
          filtros.push((r) => r[col] === val);
          return chain;
        },
        is: (col: string, val: unknown) => {
          filtros.push((r) => (r[col] ?? null) === val);
          return chain;
        },
        then: (resolve: (v: unknown) => unknown) =>
          resolve({
            data: db[tabla].filter((r) => filtros.every((f) => f(r))),
            error: null,
          }),
      };
      return chain;
    },
  }),
}));

import { consentsPorNombreRouter } from "../consentsPorNombre";
import type { TrpcContext } from "../../../_core/context";
import { Logger } from "../../../_core/logger";

function ctx(): TrpcContext {
  return {
    user: {
      id: "u1", openId: "o1", email: "a@bocatas.org", name: "A",
      loginMethod: "manus", role: "admin",
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    logger: new Logger(),
    correlationId: "consents-por-nombre-test",
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const persona = (id: string, nombre: string, apellidos: string | null) => ({
  id,
  nombre,
  apellidos,
  // Espejo literal de la columna generada, coalesce incluido.
  nombre_norm: `${nombre} ${apellidos ?? ""}`
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase(),
  deleted_at: null,
});

const consentimiento = (personId: string, over: Record<string, unknown> = {}) => ({
  person_id: personId,
  purpose: "fotografia",
  granted: true,
  revoked_at: null,
  deleted_at: null,
  ...over,
});

beforeEach(() => {
  db.persons = [];
  db.consents = [];
});

describe("persons.checkConsentByNames", () => {
  it("separa quien tiene el consentimiento de imagen vigente de quien no", async () => {
    db.persons = [persona("p1", "Ana", "García"), persona("p2", "Luis", "Pérez")];
    db.consents = [
      consentimiento("p1"),
      consentimiento("p2", { granted: false }),
    ];

    const res = await consentsPorNombreRouter
      .createCaller(ctx())
      .checkConsentByNames({ names: ["Ana García", "Luis Pérez"] });

    expect(res.con_consentimiento.map((p) => p.nombre)).toEqual(["Ana García"]);
    expect(res.sin_consentimiento.map((p) => p.nombre)).toEqual(["Luis Pérez"]);
    expect(res.no_encontrados).toEqual([]);
    expect(res.ambiguos).toEqual([]);
  });

  it("un consentimiento RETIRADO cuenta como un no", async () => {
    db.persons = [persona("p1", "Ana", "García")];
    db.consents = [consentimiento("p1", { revoked_at: "2026-03-01T00:00:00Z" })];

    const res = await consentsPorNombreRouter
      .createCaller(ctx())
      .checkConsentByNames({ names: ["Ana García"] });

    expect(res.con_consentimiento).toEqual([]);
    expect(res.sin_consentimiento.map((p) => p.nombre)).toEqual(["Ana García"]);
  });

  it("un nombre que no está en la base sale tal cual en no_encontrados", async () => {
    db.persons = [persona("p1", "Ana", "García")];

    const res = await consentsPorNombreRouter
      .createCaller(ctx())
      .checkConsentByNames({ names: ["Fulanito de Tal"] });

    expect(res.no_encontrados).toEqual(["Fulanito de Tal"]);
    expect(res.sin_consentimiento).toEqual([]);
    expect(res.con_consentimiento).toEqual([]);
  });

  it("un nombre repetido es ambiguo — NUNCA se adivina la primera fila", async () => {
    db.persons = [persona("p1", "Ana", "García"), persona("p2", "Ana", "García")];
    db.consents = [consentimiento("p1")];

    const res = await consentsPorNombreRouter
      .createCaller(ctx())
      .checkConsentByNames({ names: ["Ana García"] });

    expect(res.ambiguos).toEqual([{ input: "Ana García", matches: 2 }]);
    expect(res.con_consentimiento).toEqual([]);
    expect(res.sin_consentimiento).toEqual([]);
  });

  it("normaliza acentos, mayúsculas y espacios de más como la columna generada", async () => {
    db.persons = [persona("p1", "José", "Ñuñez")];
    db.consents = [consentimiento("p1")];

    const res = await consentsPorNombreRouter
      .createCaller(ctx())
      .checkConsentByNames({ names: ["  jose   NUNEZ " ] });

    expect(res.con_consentimiento.map((p) => p.nombre)).toEqual(["José Ñuñez"]);
  });

  it("encuentra a quien no tiene apellidos (nombre_norm acaba en espacio)", async () => {
    db.persons = [persona("p1", "Marta", null)];
    db.consents = [];

    const res = await consentsPorNombreRouter
      .createCaller(ctx())
      .checkConsentByNames({ names: ["Marta"] });

    expect(res.sin_consentimiento.map((p) => p.nombre)).toEqual(["Marta"]);
    expect(res.no_encontrados).toEqual([]);
  });

  it("otro fin del catálogo se consulta con el mismo mecanismo", async () => {
    db.persons = [persona("p1", "Ana", "García")];
    db.consents = [consentimiento("p1", { purpose: "comunicaciones_whatsapp" })];

    const res = await consentsPorNombreRouter
      .createCaller(ctx())
      .checkConsentByNames({
        names: ["Ana García"],
        purpose: "comunicaciones_whatsapp",
      });

    expect(res.con_consentimiento.map((p) => p.nombre)).toEqual(["Ana García"]);
  });
});
