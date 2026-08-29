/**
 * ManualSearchModal.trim.test.tsx — RC-06 (F027).
 *
 * Android keyboards insert a trailing space after autocomplete; the modal
 * must send the TRIMMED query to checkin.searchPersons and gate `enabled`
 * on the trimmed length, or 'Amadou ' finds nobody at the counter.
 *
 * tRPC mocked at @/lib/trpc via vi.hoisted (mirrors ManualSearchModal.a11y
 * tests); useDebounce bypassed to an identity function.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

const { mockUseQuery } = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    checkin: {
      searchPersons: {
        useQuery: mockUseQuery,
      },
    },
  },
}));

vi.mock("@/hooks/useDebounce", () => ({
  useDebounce: (v: string) => v,
}));

import { ManualSearchModal } from "../components/ManualSearchModal";

beforeEach(() => {
  mockUseQuery.mockReturnValue({ data: [], isLoading: false });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ManualSearchModal — query trimming (RC-06)", () => {
  it("sends the TRIMMED query to checkin.searchPersons", () => {
    render(<ManualSearchModal open onClose={vi.fn()} onSelect={vi.fn()} />);

    const input = screen.getByPlaceholderText("Nombre o apellidos...");
    fireEvent.change(input, { target: { value: "  Maria Garcia  " } });

    expect(mockUseQuery).toHaveBeenLastCalledWith(
      { query: "Maria Garcia" },
      { enabled: true }
    );
  });

  it("keeps the query disabled while the trimmed text is under 3 chars", () => {
    render(<ManualSearchModal open onClose={vi.fn()} onSelect={vi.fn()} />);

    const input = screen.getByPlaceholderText("Nombre o apellidos...");
    fireEvent.change(input, { target: { value: "  ab " } });

    expect(mockUseQuery).toHaveBeenLastCalledWith(
      { query: "ab" },
      { enabled: false }
    );
  });
});
