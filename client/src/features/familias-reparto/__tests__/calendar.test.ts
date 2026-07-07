import { describe, it, expect } from "vitest";
import { WEEKDAY_SHORT, weekdayIndexOf, weekdayLongOf } from "../utils/calendar";

describe("calendar — Monday-first weekday mapping (no UTC shift)", () => {
  // 2024-01-01 was a Monday. Anchoring on it verifies both the Monday-first
  // shift and that we don't drift a day from timezone parsing.
  it("maps a known Monday to index 0 and Sunday to 6", () => {
    expect(weekdayIndexOf("2024-01-01")).toBe(0); // Monday
    expect(weekdayIndexOf("2024-01-02")).toBe(1); // Tuesday
    expect(weekdayIndexOf("2024-01-06")).toBe(5); // Saturday
    expect(weekdayIndexOf("2024-01-07")).toBe(6); // Sunday
  });

  it("gives capitalized long names", () => {
    expect(weekdayLongOf("2024-01-01")).toBe("Lunes");
    expect(weekdayLongOf("2024-01-03")).toBe("Miércoles");
    expect(weekdayLongOf("2024-01-07")).toBe("Domingo");
  });

  it("has 7 Monday-first short labels starting at lun", () => {
    expect(WEEKDAY_SHORT).toHaveLength(7);
    expect(WEEKDAY_SHORT[0]).toBe("lun");
    expect(WEEKDAY_SHORT[6]).toBe("dom");
  });
});
