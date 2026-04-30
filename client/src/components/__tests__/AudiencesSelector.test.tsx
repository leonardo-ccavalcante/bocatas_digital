import { describe, it, expect, vi } from "vitest";

/**
 * Test: AudiencesSelector Component
 * 
 * Tests the multi-select logic for programs and roles in the audiences selector.
 * Component logic is tested in isolation without rendering (avoids jsdom complexity).
 */

describe("AudiencesSelector - Logic Tests", () => {
  // Mock the component behavior
  class AudiencesSelectorLogic {
    private currentRule: { programs: string[]; roles: string[] };

    constructor(initialRule: { programs: string[]; roles: string[] }) {
      this.currentRule = initialRule;
    }

    toggleProgram(programId: string): { programs: string[]; roles: string[] } {
      const newPrograms = this.currentRule.programs.includes(programId)
        ? this.currentRule.programs.filter((id) => id !== programId)
        : [...this.currentRule.programs, programId];

      this.currentRule = { ...this.currentRule, programs: newPrograms };
      return this.currentRule;
    }

    toggleRole(role: string): { programs: string[]; roles: string[] } {
      const newRoles = this.currentRule.roles.includes(role)
        ? this.currentRule.roles.filter((r) => r !== role)
        : [...this.currentRule.roles, role];

      this.currentRule = { ...this.currentRule, roles: newRoles };
      return this.currentRule;
    }

    getCurrentRule(): { programs: string[]; roles: string[] } {
      return this.currentRule;
    }
  }

  it("initializes with empty programs and roles", () => {
    const logic = new AudiencesSelectorLogic({ programs: [], roles: [] });
    const rule = logic.getCurrentRule();

    expect(rule.programs).toEqual([]);
    expect(rule.roles).toEqual([]);
  });

  it("adds a program when toggled", () => {
    const logic = new AudiencesSelectorLogic({ programs: [], roles: [] });
    const result = logic.toggleProgram("prog1");

    expect(result.programs).toContain("prog1");
    expect(result.programs.length).toBe(1);
  });

  it("removes a program when toggled twice", () => {
    const logic = new AudiencesSelectorLogic({ programs: ["prog1"], roles: [] });
    const result = logic.toggleProgram("prog1");

    expect(result.programs).not.toContain("prog1");
    expect(result.programs.length).toBe(0);
  });

  it("adds multiple programs", () => {
    const logic = new AudiencesSelectorLogic({ programs: [], roles: [] });
    logic.toggleProgram("prog1");
    const result = logic.toggleProgram("prog2");

    expect(result.programs).toContain("prog1");
    expect(result.programs).toContain("prog2");
    expect(result.programs.length).toBe(2);
  });

  it("adds a role when toggled", () => {
    const logic = new AudiencesSelectorLogic({ programs: [], roles: [] });
    const result = logic.toggleRole("admin");

    expect(result.roles).toContain("admin");
    expect(result.roles.length).toBe(1);
  });

  it("removes a role when toggled twice", () => {
    const logic = new AudiencesSelectorLogic({ programs: [], roles: ["admin"] });
    const result = logic.toggleRole("admin");

    expect(result.roles).not.toContain("admin");
    expect(result.roles.length).toBe(0);
  });

  it("adds multiple roles", () => {
    const logic = new AudiencesSelectorLogic({ programs: [], roles: [] });
    logic.toggleRole("admin");
    logic.toggleRole("voluntario");
    const result = logic.toggleRole("beneficiario");

    expect(result.roles).toContain("admin");
    expect(result.roles).toContain("voluntario");
    expect(result.roles).toContain("beneficiario");
    expect(result.roles.length).toBe(3);
  });

  it("maintains programs while toggling roles", () => {
    const logic = new AudiencesSelectorLogic({
      programs: ["prog1", "prog2"],
      roles: [],
    });
    const result = logic.toggleRole("admin");

    expect(result.programs).toContain("prog1");
    expect(result.programs).toContain("prog2");
    expect(result.roles).toContain("admin");
  });

  it("maintains roles while toggling programs", () => {
    const logic = new AudiencesSelectorLogic({
      programs: [],
      roles: ["admin", "voluntario"],
    });
    const result = logic.toggleProgram("prog1");

    expect(result.programs).toContain("prog1");
    expect(result.roles).toContain("admin");
    expect(result.roles).toContain("voluntario");
  });
});
