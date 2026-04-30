import { describe, it, expect } from "vitest";
import { isVisibleToUser } from "../announcements-helpers";
import type { AudienceRule } from "../../shared/announcementTypes";

const NOW = new Date("2026-04-30T12:00:00Z");
const PAST = new Date("2026-04-01T00:00:00Z");
const FUTURE = new Date("2026-05-15T00:00:00Z");

describe("isVisibleToUser", () => {
  it("returns false when activo=false regardless of audience", () => {
    const rule: AudienceRule = { roles: [], programs: [] };
    expect(
      isVisibleToUser({
        userRole: "admin",
        userPrograms: [],
        audiences: [rule],
        fechaInicio: null,
        fechaFin: null,
        activo: false,
        now: NOW,
      })
    ).toBe(false);
  });

  it("returns false when fecha_inicio is in the future", () => {
    const rule: AudienceRule = { roles: [], programs: [] };
    expect(
      isVisibleToUser({
        userRole: "admin",
        userPrograms: [],
        audiences: [rule],
        fechaInicio: FUTURE,
        fechaFin: null,
        activo: true,
        now: NOW,
      })
    ).toBe(false);
  });

  it("returns false when fecha_fin is in the past (expired)", () => {
    const rule: AudienceRule = { roles: [], programs: [] };
    expect(
      isVisibleToUser({
        userRole: "admin",
        userPrograms: [],
        audiences: [rule],
        fechaInicio: null,
        fechaFin: PAST,
        activo: true,
        now: NOW,
      })
    ).toBe(false);
  });

  it("returns false when fecha_fin equals now (boundary: now >= fechaFin → expired)", () => {
    const rule: AudienceRule = { roles: [], programs: [] };
    expect(
      isVisibleToUser({
        userRole: "admin",
        userPrograms: [],
        audiences: [rule],
        fechaInicio: null,
        fechaFin: NOW,
        activo: true,
        now: NOW,
      })
    ).toBe(false);
  });

  it("returns false when audiences array is empty", () => {
    expect(
      isVisibleToUser({
        userRole: "admin",
        userPrograms: [],
        audiences: [],
        fechaInicio: null,
        fechaFin: null,
        activo: true,
        now: NOW,
      })
    ).toBe(false);
  });

  it("returns true when one rule {roles:[], programs:[]} — visible to everyone", () => {
    const rule: AudienceRule = { roles: [], programs: [] };
    expect(
      isVisibleToUser({
        userRole: "voluntario",
        userPrograms: [],
        audiences: [rule],
        fechaInicio: null,
        fechaFin: null,
        activo: true,
        now: NOW,
      })
    ).toBe(true);
  });

  it("matches rule {roles:['admin'], programs:[]} for admin user with any programs", () => {
    const rule: AudienceRule = { roles: ["admin"], programs: [] };
    expect(
      isVisibleToUser({
        userRole: "admin",
        userPrograms: ["comedor"],
        audiences: [rule],
        fechaInicio: null,
        fechaFin: null,
        activo: true,
        now: NOW,
      })
    ).toBe(true);
  });

  it("does NOT match rule {roles:['admin'], programs:[]} for voluntario user", () => {
    const rule: AudienceRule = { roles: ["admin"], programs: [] };
    expect(
      isVisibleToUser({
        userRole: "voluntario",
        userPrograms: ["comedor"],
        audiences: [rule],
        fechaInicio: null,
        fechaFin: null,
        activo: true,
        now: NOW,
      })
    ).toBe(false);
  });

  it("matches rule {roles:[], programs:['comedor']} for any role enrolled in comedor", () => {
    const rule: AudienceRule = { roles: [], programs: ["comedor"] };
    expect(
      isVisibleToUser({
        userRole: "voluntario",
        userPrograms: ["comedor"],
        audiences: [rule],
        fechaInicio: null,
        fechaFin: null,
        activo: true,
        now: NOW,
      })
    ).toBe(true);
  });

  it("does NOT match rule {roles:[], programs:['comedor']} when userPrograms=[]", () => {
    const rule: AudienceRule = { roles: [], programs: ["comedor"] };
    expect(
      isVisibleToUser({
        userRole: "voluntario",
        userPrograms: [],
        audiences: [rule],
        fechaInicio: null,
        fechaFin: null,
        activo: true,
        now: NOW,
      })
    ).toBe(false);
  });

  it("intersection rule {roles:['voluntario'], programs:['comedor']} matches voluntario+comedor only", () => {
    const rule: AudienceRule = { roles: ["voluntario"], programs: ["comedor"] };
    expect(
      isVisibleToUser({
        userRole: "voluntario",
        userPrograms: ["comedor"],
        audiences: [rule],
        fechaInicio: null,
        fechaFin: null,
        activo: true,
        now: NOW,
      })
    ).toBe(true);
  });

  it("intersection rule {roles:['voluntario'], programs:['comedor']} does NOT match admin+comedor", () => {
    const rule: AudienceRule = { roles: ["voluntario"], programs: ["comedor"] };
    expect(
      isVisibleToUser({
        userRole: "admin",
        userPrograms: ["comedor"],
        audiences: [rule],
        fechaInicio: null,
        fechaFin: null,
        activo: true,
        now: NOW,
      })
    ).toBe(false);
  });

  it("two rules act as union: matches if EITHER rule matches", () => {
    const rule1: AudienceRule = { roles: ["admin"], programs: [] };
    const rule2: AudienceRule = { roles: ["voluntario"], programs: ["comedor"] };
    // admin matches rule1
    expect(
      isVisibleToUser({
        userRole: "admin",
        userPrograms: [],
        audiences: [rule1, rule2],
        fechaInicio: null,
        fechaFin: null,
        activo: true,
        now: NOW,
      })
    ).toBe(true);
    // voluntario+comedor matches rule2
    expect(
      isVisibleToUser({
        userRole: "voluntario",
        userPrograms: ["comedor"],
        audiences: [rule1, rule2],
        fechaInicio: null,
        fechaFin: null,
        activo: true,
        now: NOW,
      })
    ).toBe(true);
    // voluntario+familia matches neither
    expect(
      isVisibleToUser({
        userRole: "voluntario",
        userPrograms: ["familia"],
        audiences: [rule1, rule2],
        fechaInicio: null,
        fechaFin: null,
        activo: true,
        now: NOW,
      })
    ).toBe(false);
  });

  it("visible when fecha_inicio is null (no start restriction)", () => {
    const rule: AudienceRule = { roles: [], programs: [] };
    expect(
      isVisibleToUser({
        userRole: "admin",
        userPrograms: [],
        audiences: [rule],
        fechaInicio: null,
        fechaFin: null,
        activo: true,
        now: NOW,
      })
    ).toBe(true);
  });

  it("visible when fecha_inicio is in the past", () => {
    const rule: AudienceRule = { roles: [], programs: [] };
    expect(
      isVisibleToUser({
        userRole: "admin",
        userPrograms: [],
        audiences: [rule],
        fechaInicio: PAST,
        fechaFin: null,
        activo: true,
        now: NOW,
      })
    ).toBe(true);
  });

  it("uses default now param (smoke test — just verifies no throw)", () => {
    const rule: AudienceRule = { roles: [], programs: [] };
    expect(() =>
      isVisibleToUser({
        userRole: "admin",
        userPrograms: [],
        audiences: [rule],
        fechaInicio: null,
        fechaFin: null,
        activo: true,
      })
    ).not.toThrow();
  });
});
