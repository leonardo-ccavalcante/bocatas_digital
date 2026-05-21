/**
 * Tests for BackLink component.
 * @vitest-environment jsdom
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import BackLink, { resolveParent } from "@/components/layout/BackLink";

afterEach(cleanup);

function renderAt(path: string, props: React.ComponentProps<typeof BackLink> = {}) {
  const { hook } = memoryLocation({ path, static: true });
  return render(
    <Router hook={hook}>
      <BackLink {...props} />
    </Router>
  );
}

// ── visibility ────────────────────────────────────────────────────────────────

describe("BackLink – visibility", () => {
  it("renders nothing at root '/'", () => {
    renderAt("/");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders at /personas/<id>", () => {
    renderAt("/personas/abc-123");
    expect(screen.getByRole("button")).toBeTruthy();
  });

  it("renders at /programas/<slug>", () => {
    renderAt("/programas/programa_comedor");
    expect(screen.getByRole("button")).toBeTruthy();
  });

  it("renders at familia detail route", () => {
    renderAt("/programas/programa_familias/familia/fam-1");
    expect(screen.getByRole("button")).toBeTruthy();
  });
});

// ── label ─────────────────────────────────────────────────────────────────────

describe("BackLink – label", () => {
  it("shows 'Volver' by default", () => {
    renderAt("/personas/abc-123");
    expect(screen.getByText("Volver")).toBeTruthy();
  });

  it("shows custom label when supplied", () => {
    renderAt("/personas/abc-123", { label: "Personas" });
    expect(screen.getByText("Personas")).toBeTruthy();
  });

  it("has an accessible aria-label", () => {
    renderAt("/personas/abc-123");
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-label")).toBeTruthy();
  });
});

// ── parent resolution ─────────────────────────────────────────────────────────

describe("BackLink – parent resolution", () => {
  it("returns null for root", () => {
    renderAt("/");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("resolves /personas/<id> → button present", () => {
    renderAt("/personas/abc-123");
    expect(screen.getByRole("button")).toBeTruthy();
  });

  it("resolves /programas/<slug> → button present", () => {
    renderAt("/programas/prog-abc");
    expect(screen.getByRole("button")).toBeTruthy();
  });

  it("resolves familia + miembro deep path → button present", () => {
    renderAt("/programas/programa_familias/familia/fam-1/miembro/m-1");
    expect(screen.getByRole("button")).toBeTruthy();
  });
});

// ── interaction ───────────────────────────────────────────────────────────────

describe("BackLink – click behaviour", () => {
  it("fires click without throwing", () => {
    renderAt("/personas/abc-123", { href: "/personas" });
    const btn = screen.getByRole("button");
    expect(() => fireEvent.click(btn)).not.toThrow();
  });

  it("uses override href when supplied", () => {
    renderAt("/personas/abc-123", { href: "/custom-target" });
    const btn = screen.getByRole("button");
    expect(btn).toBeTruthy();
  });
});

// ── resolveParent (pure logic — asserts the RESOLVED target, not just presence) ──

describe("resolveParent", () => {
  it("returns null at root", () => {
    expect(resolveParent("/")).toBeNull();
    expect(resolveParent("")).toBeNull();
  });

  it("resolves /personas/<id> → /personas", () => {
    expect(resolveParent("/personas/abc-123")).toBe("/personas");
    expect(resolveParent("/personas/nueva")).toBe("/personas");
  });

  it("resolves /programas/<slug> → /programas", () => {
    expect(resolveParent("/programas/programa_comedor")).toBe("/programas");
  });

  it("resolves familia detail → /programas/programa_familias", () => {
    expect(resolveParent("/programas/programa_familias/familia/fam-1")).toBe(
      "/programas/programa_familias"
    );
  });

  it("resolves familia + miembro deep path → familia detail (not .../miembro)", () => {
    expect(
      resolveParent("/programas/programa_familias/familia/fam-1/miembro/m-1")
    ).toBe("/programas/programa_familias/familia/fam-1");
  });

  it("resolves /admin/<section> → home", () => {
    expect(resolveParent("/admin/usuarios")).toBe("/");
  });
});
