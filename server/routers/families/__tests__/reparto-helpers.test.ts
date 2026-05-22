import { describe, it, expect } from "vitest";
import { pickRepresentatives } from "../reparto-helpers";

describe("pickRepresentatives (PRE-2) — deterministic titular rule", () => {
  it("prefers a 'parent' over other relations", () => {
    const reps = pickRepresentatives([
      { familia_id: "A", relacion: "child", created_at: "2026-01-01", person_id: "pc" },
      { familia_id: "A", relacion: "parent", created_at: "2026-02-01", person_id: "pp" },
    ]);
    expect(reps.get("A")?.person_id).toBe("pp");
  });

  it("falls back to earliest member when no parent exists", () => {
    const reps = pickRepresentatives([
      { familia_id: "B", relacion: "other", created_at: "2026-03-01", person_id: "p2" },
      { familia_id: "B", relacion: "sibling", created_at: "2026-01-01", person_id: "p1" },
    ]);
    expect(reps.get("B")?.person_id).toBe("p1");
  });

  it("is deterministic and handles multiple families", () => {
    const input = [
      { familia_id: "A", relacion: "parent", created_at: "2026-01-02", person_id: "a2" },
      { familia_id: "A", relacion: "parent", created_at: "2026-01-01", person_id: "a1" },
      { familia_id: "B", relacion: "child", created_at: "2026-01-01", person_id: "b1" },
    ];
    expect(pickRepresentatives(input).get("A")?.person_id).toBe("a1");
    expect(pickRepresentatives(input).get("B")?.person_id).toBe("b1");
  });
});
