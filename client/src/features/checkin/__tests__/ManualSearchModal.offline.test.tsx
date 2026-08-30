/**
 * ManualSearchModal.offline.test.tsx — F029 regression lock-in.
 *
 * Offline, react-query PAUSES a network-only query (fetchStatus "paused",
 * isLoading false, data undefined) — before the fix no render branch matched
 * and the modal showed nothing at all. It must tell the volunteer, in
 * Spanish, that name search needs internet.
 *
 * tRPC is mocked at @/lib/trpc via vi.hoisted (mirrors
 * ManualSearchModal.a11y.test.tsx); useDebounce is identity-mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

const { mockUseQuery } = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    checkin: {
      searchPersons: { useQuery: mockUseQuery },
    },
  },
}));

vi.mock("@/hooks/useDebounce", () => ({
  useDebounce: (v: string) => v,
}));

import { ManualSearchModal } from "../components/ManualSearchModal";

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); });

describe("ManualSearchModal — offline paused query (F029)", () => {
  it("shows a Spanish offline hint when the query is paused with no cached results", () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false, fetchStatus: "paused" });
    render(<ManualSearchModal open onClose={vi.fn()} onSelect={vi.fn()} />);

    // DialogContent renders into a portal on document.body.
    const input = document.body.querySelector<HTMLInputElement>("input");
    expect(input).not.toBeNull();
    fireEvent.change(input!, { target: { value: "Amadou" } });

    const hint = screen.getByText(/Sin conexión: la búsqueda por nombre necesita internet/);
    expect(hint).toBeTruthy();
    // WCAG: announced as a status, like the loading and empty states.
    expect(hint.closest('[role="status"]')).not.toBeNull();
  });

  it("does NOT show the offline hint while the query is actively fetching", () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true, fetchStatus: "fetching" });
    render(<ManualSearchModal open onClose={vi.fn()} onSelect={vi.fn()} />);

    const input = document.body.querySelector<HTMLInputElement>("input");
    expect(input).not.toBeNull();
    fireEvent.change(input!, { target: { value: "Amadou" } });

    expect(screen.queryByText(/Sin conexión/)).toBeNull();
  });
});
