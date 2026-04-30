import { describe, it, expect } from "vitest";
import { shouldFireWebhook } from "../announcements-helpers";

describe("shouldFireWebhook", () => {
  it("fires on create when es_urgente=true", () => {
    expect(shouldFireWebhook(null, true, true)).toBe(true);
  });

  it("does NOT fire on create when es_urgente=false", () => {
    expect(shouldFireWebhook(null, false, true)).toBe(false);
  });

  it("fires on edit when urgency flips false → true", () => {
    expect(shouldFireWebhook(false, true, false)).toBe(true);
  });

  it("does NOT fire on edit when urgency stays true → true (already fired)", () => {
    expect(shouldFireWebhook(true, true, false)).toBe(false);
  });

  it("does NOT fire on edit when urgency flips true → false (no 'no longer urgent' event)", () => {
    expect(shouldFireWebhook(true, false, false)).toBe(false);
  });

  it("does NOT fire on edit when urgency stays false → false", () => {
    expect(shouldFireWebhook(false, false, false)).toBe(false);
  });
});
