import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const identifyStaff = vi.fn();
const resetPostHog = vi.fn();
const useAuth = vi.fn();

vi.mock("../client", () => ({
  identifyStaff: (...a: unknown[]) => identifyStaff(...a),
  resetPostHog: (...a: unknown[]) => resetPostHog(...a),
}));
vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => useAuth(),
}));

import { useIdentifyStaff } from "../useIdentifyStaff";

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("useIdentifyStaff", () => {
  it.each(["admin", "voluntario", "superadmin"])(
    "identifies a %s with stringified id + role only",
    role => {
      useAuth.mockReturnValue({
        user: { id: 42, role, name: "Leo", email: "leo@x.com" },
        isAuthenticated: true,
      });
      renderHook(() => useIdentifyStaff());
      expect(identifyStaff).toHaveBeenCalledWith("42", role);
      expect(resetPostHog).not.toHaveBeenCalled();
    }
  );

  it("never identifies a beneficiario", () => {
    useAuth.mockReturnValue({
      user: { id: 7, role: "beneficiario" },
      isAuthenticated: true,
    });
    renderHook(() => useIdentifyStaff());
    expect(identifyStaff).not.toHaveBeenCalled();
  });

  it("resets when unauthenticated (logout)", () => {
    useAuth.mockReturnValue({ user: null, isAuthenticated: false });
    renderHook(() => useIdentifyStaff());
    expect(identifyStaff).not.toHaveBeenCalled();
    expect(resetPostHog).toHaveBeenCalled();
  });
});
