// @vitest-environment jsdom
/**
 * complianceColorScale — pure-function unit tests for the compliance color
 * encoding fix (informe-tier1-hardening).
 *
 * These tests are DB-free and DOM-free: they exercise redScale() and the
 * compliance-inversion formula used by styleFn in MapaChoropleth.tsx.
 *
 * Iron Law: fix the implementation, never the test.
 */

import { describe, it, expect } from "vitest";
import { redScale } from "../MapaChoropleth";

// ── helpers ───────────────────────────────────────────────────────────────────

/** Mirror of the inversion used in styleFn and legendBins. */
function complianceColor(ratio: number): string {
  const t = 1 - Math.min(1, Math.max(0, ratio));
  return redScale(t);
}

/** Extract the red channel from an "rgb(r,g,b)" string. */
function redChannel(rgb: string): number {
  const m = rgb.match(/rgb\((\d+),(\d+),(\d+)\)/);
  if (!m) throw new Error(`Unexpected color: ${rgb}`);
  return parseInt(m[1], 10);
}

/** Extract the green channel. */
function greenChannel(rgb: string): number {
  const m = rgb.match(/rgb\((\d+),(\d+),(\d+)\)/);
  if (!m) throw new Error(`Unexpected color: ${rgb}`);
  return parseInt(m[2], 10);
}

// ── redScale unit tests ───────────────────────────────────────────────────────

describe("redScale", () => {
  it("t=0 returns a light/pale color (high R, high G, high B)", () => {
    const color = redScale(0);
    const r = redChannel(color);
    const g = greenChannel(color);
    // At t=0: rgb(254, 229, 217) — pale warm white
    expect(r).toBeGreaterThan(220);
    expect(g).toBeGreaterThan(180);
  });

  it("t=1 returns a dark red (high R, low G, low B)", () => {
    const color = redScale(1);
    const r = redChannel(color);
    const g = greenChannel(color);
    // At t=1: rgb(180, 30, 30) — dark red
    expect(r).toBeGreaterThan(150);
    expect(g).toBeLessThan(60);
  });

  it("t=0 is lighter than t=1 (green channel decreases as t increases)", () => {
    expect(greenChannel(redScale(0))).toBeGreaterThan(greenChannel(redScale(1)));
  });
});

// ── compliance color encoding tests (funder-correct) ─────────────────────────

describe("compliance color encoding (funder-correct inversion)", () => {
  it("LOW compliance (0%) maps to the alarming dark-red color", () => {
    const color = complianceColor(0);
    const g = greenChannel(color);
    // Low compliance → t=1 → dark red → green channel is very low
    expect(g).toBeLessThan(60);
  });

  it("HIGH compliance (100%) maps to the reassuring light color", () => {
    const color = complianceColor(1);
    const g = greenChannel(color);
    // High compliance → t=0 → light → green channel is high
    expect(g).toBeGreaterThan(180);
  });

  it("50% compliance maps to a mid-tone between the extremes", () => {
    const midG = greenChannel(complianceColor(0.5));
    const lowG  = greenChannel(complianceColor(0));
    const highG = greenChannel(complianceColor(1));
    expect(midG).toBeGreaterThan(lowG);
    expect(midG).toBeLessThan(highG);
  });

  it("is monotone: higher compliance → lighter (higher green channel)", () => {
    const steps = [0, 0.25, 0.5, 0.75, 1];
    const greens = steps.map((r) => greenChannel(complianceColor(r)));
    // Each step should be >= previous (monotone non-decreasing)
    for (let i = 1; i < greens.length; i++) {
      expect(greens[i]).toBeGreaterThanOrEqual(greens[i - 1]);
    }
  });

  it("clamped: compliance > 1 treated as 1 (same as full compliance)", () => {
    expect(complianceColor(1.5)).toBe(complianceColor(1));
  });

  it("clamped: compliance < 0 treated as 0 (same as zero compliance)", () => {
    expect(complianceColor(-0.1)).toBe(complianceColor(0));
  });
});
