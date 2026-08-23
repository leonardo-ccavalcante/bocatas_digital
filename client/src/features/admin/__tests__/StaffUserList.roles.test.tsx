/**
 * StaffUserList — role selector.
 *
 * Wired up alongside #144: `admin.setUserRole` existed on the server since T7-E1
 * but had NO client caller, so roles could only be changed from the Supabase
 * dashboard and `superadmin` could not be granted from the app at all.
 *
 * Two behaviours here are safety, not convenience:
 *   - the current user gets a badge, not a selector (self-demotion lockout);
 *   - nothing is written until a confirmation dialog is accepted.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const SELF_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";

const setUserRoleMutate = vi.fn();

const staffUsers = [
  {
    id: SELF_ID,
    email: "super@bocatas.test",
    nombre: "Super Admin",
    role: "superadmin",
    created_at: "2026-01-01T00:00:00Z",
    last_sign_in_at: null,
  },
  {
    id: OTHER_ID,
    email: "vol@bocatas.test",
    nombre: "Vol Untaria",
    role: "voluntario",
    created_at: "2026-01-01T00:00:00Z",
    last_sign_in_at: null,
  },
];

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: SELF_ID, role: "superadmin" } }),
}));

vi.mock("../hooks/useStaffUsers", () => ({
  useStaffUsers: () => ({ staffUsers, isLoading: false, error: null }),
  useRevokeStaffAccess: () => ({ mutate: vi.fn(), isPending: false }),
  useSetUserRole: () => ({ mutate: setUserRoleMutate, isPending: false }),
}));

const { StaffUserList } = await import("../components/StaffUserList");

// jsdom gaps that Radix Select relies on — same stubs as FamiliasFilterBar.test.tsx.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// Auto-cleanup is not wired in this repo (no `globals: true`), so a leftover
// render would leave two comboboxes in the DOM and every query would be ambiguous.
afterEach(cleanup);

beforeEach(() => {
  setUserRoleMutate.mockReset();
});

describe("StaffUserList — cambio de rol", () => {
  it("offers a labelled role selector for other users", () => {
    render(<StaffUserList />);

    // Labelled per row: without an accessible name, a screen-reader user cannot
    // tell which person a combobox belongs to (WCAG 2.1 AA).
    expect(
      screen.getByRole("combobox", { name: /Rol de Vol Untaria/i })
    ).toBeInTheDocument();
  });

  it("shows the current user a badge instead of a selector", () => {
    render(<StaffUserList />);

    expect(
      screen.queryByRole("combobox", { name: /Rol de Super Admin/i })
    ).not.toBeInTheDocument();
    expect(screen.getByText(/\(tú\)/)).toBeInTheDocument();
  });

  it("does not write until the confirmation is accepted", async () => {
    const user = userEvent.setup();
    render(<StaffUserList />);

    await user.click(screen.getByRole("combobox", { name: /Rol de Vol Untaria/i }));
    await user.click(await screen.findByRole("option", { name: "Admin" }));

    // Dialog is open, nothing written yet.
    await screen.findByRole("alertdialog");
    expect(setUserRoleMutate).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Cambiar rol/i }));

    await waitFor(() =>
      expect(setUserRoleMutate).toHaveBeenCalledWith(
        expect.objectContaining({ userId: OTHER_ID, role: "admin" }),
        expect.anything()
      )
    );
  });

  it("warns specifically when granting superadmin", async () => {
    const user = userEvent.setup();
    render(<StaffUserList />);

    await user.click(screen.getByRole("combobox", { name: /Rol de Vol Untaria/i }));
    await user.click(await screen.findByRole("option", { name: "Superadmin" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(/puede invitar, revocar y cambiar el rol/i);
    expect(setUserRoleMutate).not.toHaveBeenCalled();
  });

  it("writes nothing when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    render(<StaffUserList />);

    await user.click(screen.getByRole("combobox", { name: /Rol de Vol Untaria/i }));
    await user.click(await screen.findByRole("option", { name: "Admin" }));
    await screen.findByRole("alertdialog");
    await user.click(screen.getByRole("button", { name: /Cancelar/i }));

    expect(setUserRoleMutate).not.toHaveBeenCalled();
  });
});
