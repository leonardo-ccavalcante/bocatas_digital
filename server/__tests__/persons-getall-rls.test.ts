/**
 * persons-getall-rls.test.ts — Phase 6 QA-1C / F-003.
 *
 * CLAUDE.md §3 high-risk fields (`situacion_legal`, `foto_documento_url`,
 * `recorrido_migratorio`) must be restricted to admin/superadmin.
 *
 * `persons.getAll` uses `createAdminClient()` (service role) because Manus
 * OAuth users have no Supabase JWT — so RLS sees them as anon. The role
 * gate is therefore enforced at the tRPC layer via
 * `getAllColumnsForRole(role)`. This test locks the gate.
 */
import { describe, it, expect } from "vitest";
import {
  PERSONS_GETALL_BASE_COLUMNS,
  PERSONS_GETALL_ADMIN_COLUMNS,
  getAllColumnsForRole,
} from "../routers/persons/crud";

describe("persons.getAll — RLS-equivalent column gate (F-003)", () => {
  it("base columns do NOT include situacion_legal", () => {
    expect(PERSONS_GETALL_BASE_COLUMNS).not.toContain("situacion_legal");
  });

  it("admin columns DO include situacion_legal", () => {
    expect(PERSONS_GETALL_ADMIN_COLUMNS).toContain("situacion_legal");
  });

  it("voluntario role gets the base (PII-restricted) column set", () => {
    expect(getAllColumnsForRole("voluntario")).toBe(PERSONS_GETALL_BASE_COLUMNS);
    expect(getAllColumnsForRole("voluntario")).not.toContain("situacion_legal");
  });

  it("user role gets the base (PII-restricted) column set", () => {
    expect(getAllColumnsForRole("user")).toBe(PERSONS_GETALL_BASE_COLUMNS);
    expect(getAllColumnsForRole("user")).not.toContain("situacion_legal");
  });

  it("beneficiario role gets the base (PII-restricted) column set", () => {
    expect(getAllColumnsForRole("beneficiario")).toBe(PERSONS_GETALL_BASE_COLUMNS);
    expect(getAllColumnsForRole("beneficiario")).not.toContain("situacion_legal");
  });

  it("admin role gets the full column set with situacion_legal", () => {
    expect(getAllColumnsForRole("admin")).toBe(PERSONS_GETALL_ADMIN_COLUMNS);
    expect(getAllColumnsForRole("admin")).toContain("situacion_legal");
  });

  it("superadmin role gets the full column set with situacion_legal", () => {
    expect(getAllColumnsForRole("superadmin")).toBe(PERSONS_GETALL_ADMIN_COLUMNS);
    expect(getAllColumnsForRole("superadmin")).toContain("situacion_legal");
  });

  it("undefined / null role falls back to the base set (defensive)", () => {
    expect(getAllColumnsForRole(undefined)).toBe(PERSONS_GETALL_BASE_COLUMNS);
    expect(getAllColumnsForRole(null)).toBe(PERSONS_GETALL_BASE_COLUMNS);
    expect(getAllColumnsForRole(undefined)).not.toContain("situacion_legal");
  });

  it("typo / future role unknowns fall back to the base set (fail-closed)", () => {
    expect(getAllColumnsForRole("typo")).toBe(PERSONS_GETALL_BASE_COLUMNS);
    expect(getAllColumnsForRole("ADMIN")).not.toContain("situacion_legal"); // case-sensitive
  });
});
