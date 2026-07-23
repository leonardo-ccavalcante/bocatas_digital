/**
 * CloseoutDayView.firma.test.tsx
 *
 * TDD tests for the on-screen signature flow in CloseoutDayView.
 *
 * Root cause: REPARTO_FIRMA_ENABLED was not set → getFirmaEnabled returned
 * { enabled: false } → useSignFlow = false → AttendSignFlow never opened.
 *
 * These tests verify:
 * 1. When firma is ENABLED and signerPersonId is known → AttendSignFlow dialog opens on "Atender"
 * 2. When firma is DISABLED → plain AlertDialog opens instead (no AttendSignFlow)
 * 3. When firma is ENABLED but signerPersonId is null → plain AlertDialog opens (no signer)
 */
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

// ── jsdom stubs ───────────────────────────────────────────────────────────────
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = global.ResizeObserver ?? ResizeObserverStub;

// ── tRPC mock ─────────────────────────────────────────────────────────────────
const {
  mockUseSlotRoster,
  mockUseFirmaEnabled,
  mockMarkAttendanceMutate,
  mockUndoAttendanceMutate,
  mockRecordRepartoSignatureMutate,
} = vi.hoisted(() => ({
  mockUseSlotRoster: vi.fn(),
  mockUseFirmaEnabled: vi.fn(),
  mockMarkAttendanceMutate: vi.fn(),
  mockUndoAttendanceMutate: vi.fn(),
  mockRecordRepartoSignatureMutate: vi.fn(),
}));

vi.mock("../hooks/useReparto", () => ({
  useSlotRoster: mockUseSlotRoster,
  useFirmaEnabled: mockUseFirmaEnabled,
  useMarkAttendance: vi.fn(() => ({
    mutate: mockMarkAttendanceMutate,
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  })),
  useUndoAttendance: vi.fn(() => ({
    mutate: mockUndoAttendanceMutate,
    isPending: false,
  })),
  useRecordRepartoSignature: vi.fn(() => ({
    mutate: mockRecordRepartoSignatureMutate,
    isPending: false,
  })),
}));

// Mock CloseoutScanner (QR scanner — not relevant to firma flow)
vi.mock("../components/CloseoutScanner", () => ({
  CloseoutScanner: () => <div data-testid="closeout-scanner" />,
}));

// Mock SignaturePad (canvas — not available in jsdom)
vi.mock("@/features/families/components/SignaturePad", () => ({
  SignaturePad: ({ onCapture }: { onCapture: (d: string) => void }) => (
    <div data-testid="signature-pad">
      <button onClick={() => onCapture("data:image/png;base64,abc")}>Firmar</button>
    </div>
  ),
}));

import { CloseoutDayView } from "../components/CloseoutDayView";

const ROUND_ID = "aaaa0000-0000-4000-8000-000000000001";
const SLOT_ID = "bbbb0000-0000-4000-8000-000000000002";
const ASSIGNMENT_ID = "cccc0000-0000-4000-8000-000000000003";
const SIGNER_ID = "dddd0000-0000-4000-8000-000000000004";

const makeRoster = (signerPersonId: string | null = SIGNER_ID) => ({
  slot: { id: SLOT_ID, round_id: ROUND_ID, slot_date: "2026-08-01", turno: "manana", estado: "abierto" },
  pending: [
    {
      id: ASSIGNMENT_ID,
      family_id: "fam-1",
      expediente: "001",
      total_miembros: 3,
      nombre_titular: "Familia García",
      titular_person_id: signerPersonId,
      es_sugerido: true,
    },
  ],
  attended_here: [],
});

afterEach(cleanup);

beforeEach(() => {
  mockUseSlotRoster.mockReturnValue({ data: makeRoster(), isLoading: false });
  mockMarkAttendanceMutate.mockReset();
  mockRecordRepartoSignatureMutate.mockReset();
});

describe("CloseoutDayView — firma flow", () => {
  it("opens AttendSignFlow (signature dialog) when firma is enabled and signerPersonId is known", () => {
    mockUseFirmaEnabled.mockReturnValue({ data: { enabled: true } });

    render(<CloseoutDayView roundId={ROUND_ID} slotId={SLOT_ID} />);

    // Click "Atender" button
    const atenderBtn = screen.getByRole("button", { name: /Atender Familia García/i });
    fireEvent.click(atenderBtn);

    // AttendSignFlow dialog should open — it contains the SignaturePad
    expect(screen.getByTestId("signature-pad")).toBeTruthy();
    // The dialog title should mention the family label
    expect(screen.getByText(/Firma de entrega/i)).toBeTruthy();
  });

  it("opens plain AlertDialog (no signature) when firma is DISABLED", () => {
    mockUseFirmaEnabled.mockReturnValue({ data: { enabled: false } });

    render(<CloseoutDayView roundId={ROUND_ID} slotId={SLOT_ID} />);

    const atenderBtn = screen.getByRole("button", { name: /Atender Familia García/i });
    fireEvent.click(atenderBtn);

    // Plain confirm dialog — no signature pad
    expect(screen.queryByTestId("signature-pad")).toBeNull();
    expect(screen.getByText(/Marcar como atendida/i)).toBeTruthy();
  });

  it("opens plain AlertDialog when firma is enabled but signerPersonId is null", () => {
    mockUseFirmaEnabled.mockReturnValue({ data: { enabled: true } });
    mockUseSlotRoster.mockReturnValue({ data: makeRoster(null), isLoading: false });

    render(<CloseoutDayView roundId={ROUND_ID} slotId={SLOT_ID} />);

    const atenderBtn = screen.getByRole("button", { name: /Atender Familia García/i });
    fireEvent.click(atenderBtn);

    // No signer → falls back to plain confirm
    expect(screen.queryByTestId("signature-pad")).toBeNull();
    expect(screen.getByText(/Marcar como atendida/i)).toBeTruthy();
  });
});
