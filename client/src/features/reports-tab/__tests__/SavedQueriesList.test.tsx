/**
 * @vitest-environment jsdom
 *
 * SavedQueriesList.test.tsx — Contract tests for the saved queries list.
 *
 * Tests:
 *   - Renders skeleton while loading
 *   - Renders empty state when no queries
 *   - Renders a row for each saved query
 *   - Clicking "Ejecutar" on a row fires onRun callback
 *   - Delete button visible on own queries; calls onDelete
 */

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

// ResizeObserver stub
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = global.ResizeObserver ?? ResizeObserverStub;

// Mock trpc before importing the component
const { mockListUseQuery, mockDeleteMutate } = vi.hoisted(() => ({
  mockListUseQuery: vi.fn(),
  mockDeleteMutate: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    reports: {
      list: {
        useQuery: mockListUseQuery,
      },
      delete: {
        useMutation: () => ({
          mutate: mockDeleteMutate,
          isPending: false,
        }),
      },
    },
  },
}));

import { SavedQueriesList } from "../SavedQueriesList";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const CURRENT_USER_ID = "user-abc";

const sampleQueries = [
  {
    id: "q1",
    nombre: "Familias en Carabanchel",
    descripcion: "Filtro por distrito",
    is_shared: false,
    user_id: CURRENT_USER_ID,
    spec_json: { entity: "families", filters: [], limit: 100 },
    created_at: "2026-05-01T00:00:00Z",
    programa_id: null,
  },
  {
    id: "q2",
    nombre: "Consulta compartida",
    descripcion: null,
    is_shared: true,
    user_id: "other-user",
    spec_json: { entity: "deliveries", filters: [], limit: 500 },
    created_at: "2026-04-20T00:00:00Z",
    programa_id: null,
  },
];

describe("SavedQueriesList", () => {
  it("renders a loading skeleton while data is loading", () => {
    mockListUseQuery.mockReturnValue({ data: undefined, isLoading: true });
    render(<SavedQueriesList currentUserId={CURRENT_USER_ID} onRun={vi.fn()} />);
    // A skeleton placeholder should be visible
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("renders empty state when list is empty", () => {
    mockListUseQuery.mockReturnValue({ data: [], isLoading: false });
    render(<SavedQueriesList currentUserId={CURRENT_USER_ID} onRun={vi.fn()} />);
    expect(screen.getByText(/sin consultas guardadas/i)).toBeInTheDocument();
  });

  it("renders one row per saved query", () => {
    mockListUseQuery.mockReturnValue({ data: sampleQueries, isLoading: false });
    render(<SavedQueriesList currentUserId={CURRENT_USER_ID} onRun={vi.fn()} />);
    expect(screen.getByText("Familias en Carabanchel")).toBeInTheDocument();
    expect(screen.getByText("Consulta compartida")).toBeInTheDocument();
  });

  it("clicking Ejecutar fires onRun with the query spec", () => {
    const onRun = vi.fn();
    mockListUseQuery.mockReturnValue({ data: sampleQueries, isLoading: false });
    render(<SavedQueriesList currentUserId={CURRENT_USER_ID} onRun={onRun} />);
    const runButtons = screen.getAllByRole("button", { name: /ejecutar/i });
    fireEvent.click(runButtons[0]);
    expect(onRun).toHaveBeenCalledWith(sampleQueries[0].spec_json);
  });

  it("shows delete button only for own queries", () => {
    mockListUseQuery.mockReturnValue({ data: sampleQueries, isLoading: false });
    render(<SavedQueriesList currentUserId={CURRENT_USER_ID} onRun={vi.fn()} />);
    const deleteButtons = screen.getAllByRole("button", { name: /eliminar/i });
    // Only q1 belongs to CURRENT_USER_ID, so exactly 1 delete button
    expect(deleteButtons).toHaveLength(1);
  });

  it("clicking delete button calls trpc delete mutation with query id", () => {
    mockListUseQuery.mockReturnValue({ data: sampleQueries, isLoading: false });
    render(<SavedQueriesList currentUserId={CURRENT_USER_ID} onRun={vi.fn()} />);
    const deleteBtn = screen.getByRole("button", { name: /eliminar/i });
    fireEvent.click(deleteBtn);
    expect(mockDeleteMutate).toHaveBeenCalledWith({ id: "q1" });
  });
});
