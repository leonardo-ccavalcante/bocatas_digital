/**
 * responsive.mobile.test.tsx — TDD tests for mobile responsiveness fixes
 *
 * Covers 4 root causes identified via systematic-debugging:
 * 1. DateRangeFilter: wrapper must have shrink-0 (not overflow-x-auto) so pills
 *    don't get compressed when parent row has overflow-x-auto
 * 2. PersonsFilterBar: ToggleGroups must use flex-nowrap (not flex-wrap) inside
 *    overflow-x-auto container — flex-wrap causes chips to stack instead of scroll
 * 3. ProgramaDetalle header: must have flex-wrap so buttons don't overlap title
 *    on 375px screens
 * 4. FamiliasList table: Estado and Informe cells must have whitespace-nowrap
 *    to prevent "Pendiente" badge from wrapping to two lines
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// ── Mock dependencies ────────────────────────────────────────────────────────
vi.mock("@/lib/trpc", () => ({
  trpc: {
    programs: {
      getBySlug: { useQuery: () => ({ data: null, isLoading: true, error: null }) },
      getEnrollments: { useQuery: () => ({ data: null, isLoading: true }) },
    },
    useUtils: () => ({}),
  },
}));

vi.mock("wouter", () => ({
  useParams: () => ({ slug: "test-slug" }),
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  useLocation: () => ["/", vi.fn()],
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { role: "admin", id: "u1" } }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const PROJECT_ROOT = resolve(process.cwd(), "client/src");

// ── Test 1: DateRangeFilter wrapper has shrink-0 (not overflow-x-auto) ───────
describe("DateRangeFilter — mobile responsiveness", () => {
  it("renders all period pills and wrapper has shrink-0 to prevent compression", async () => {
    const { DateRangeFilter } = await import(
      "@/features/dashboard/components/DateRangeFilter"
    );
    const { container } = render(
      <DateRangeFilter value="today" onChange={vi.fn()} />
    );
    // All 3 pills must be rendered
    expect(screen.getByRole("button", { name: /hoy/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /semana/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /mes/i })).toBeInTheDocument();
    // Wrapper must have shrink-0 so it doesn't compress when parent has overflow-x-auto
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toMatch(/shrink-0/);
    // Each pill must also have shrink-0 to prevent individual pill compression
    const pills = container.querySelectorAll("button");
    pills.forEach((pill) => {
      expect(pill.className).toMatch(/shrink-0/);
    });
  });
});

// ── Test 2: PersonsFilterBar — flex-nowrap inside overflow-x-auto ────────────
describe("PersonsFilterBar — mobile responsiveness", () => {
  it("ToggleGroup containers use flex-nowrap (not flex-wrap) inside overflow-x-auto", () => {
    const source = readFileSync(
      resolve(PROJECT_ROOT, "features/persons/components/PersonsFilterBar.tsx"),
      "utf-8"
    );
    // Must have overflow-x-auto for horizontal scroll
    expect(source).toMatch(/overflow-x-auto/);
    // ToggleGroups inside must NOT have flex-wrap — it conflicts with overflow-x-auto
    // causing chips to stack vertically instead of scrolling horizontally
    const toggleGroupsWithWrap = source.match(/ToggleGroup[^>]*className[^>]*flex-wrap/g);
    expect(toggleGroupsWithWrap).toBeNull();
    // ToggleGroups must use flex-nowrap for correct horizontal scroll behavior
    const toggleGroupsWithNowrap = source.match(/flex-nowrap/g);
    expect(toggleGroupsWithNowrap).not.toBeNull();
    expect(toggleGroupsWithNowrap!.length).toBeGreaterThanOrEqual(2);
  });
});

// ── Test 3: ProgramaDetalle header — flex-wrap prevents button overlap ────────
describe("ProgramaDetalle header — mobile responsiveness", () => {
  it("header row has flex-wrap to prevent title/button overlap on 375px screens", () => {
    const source = readFileSync(
      resolve(PROJECT_ROOT, "pages/ProgramaDetalle.tsx"),
      "utf-8"
    );
    // The header row containing both title and action buttons must have flex-wrap
    // Without flex-wrap, buttons with shrink-0 overlap the title on 375px screens
    expect(source).toMatch(/flex flex-wrap items-start justify-between/);
  });
});

// ── Test 4: FamiliasList table — badge cells have whitespace-nowrap ──────────
describe("FamiliasList table — mobile responsiveness", () => {
  it("Estado and Informe table cells have whitespace-nowrap to prevent badge wrapping", () => {
    const source = readFileSync(
      resolve(PROJECT_ROOT, "features/familias-tab/FamiliasList.tsx"),
      "utf-8"
    );
    // The Estado and Informe <td> cells must have whitespace-nowrap
    // to prevent "Pendiente" badge from wrapping to two lines on narrow screens
    const matches = source.match(/whitespace-nowrap/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  it("FamiliasList table container has overflow-x-auto for horizontal scroll", () => {
    const source = readFileSync(
      resolve(PROJECT_ROOT, "features/familias-tab/FamiliasList.tsx"),
      "utf-8"
    );
    expect(source).toMatch(/overflow-x-auto/);
  });
});
