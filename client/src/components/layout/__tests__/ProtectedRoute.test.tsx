/**
 * ProtectedRoute rate-limit resilience (#166).
 *
 * A rate-limit 429 on auth.me used to leave isAuthenticated=false, which
 * bounced the whole sede to /login. ProtectedRoute now redirects ONLY when
 * useAuth reports a DEFINITIVE unauthenticated state; a transient error shows a
 * retry instead.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const mockAuth = {
  user: null as { role?: string } | null,
  loading: false,
  isAuthenticated: false,
  isUnauthenticated: false,
  error: null,
  refresh: vi.fn(),
  logout: vi.fn(),
};

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => mockAuth }));
vi.mock("wouter", () => ({ useLocation: () => ["/", vi.fn()] }));
vi.mock("../AppShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="shell">{children}</div>,
}));
vi.mock("@/const", () => ({ getLoginUrl: () => "/login" }));

import ProtectedRoute from "../ProtectedRoute";

let hrefSetter: ReturnType<typeof vi.fn>;
beforeEach(() => {
  hrefSetter = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      pathname: "/",
      set href(v: string) { hrefSetter(v); },
      get href() { return "/"; },
    },
  });
});
afterEach(() => cleanup());

function setAuth(a: Partial<typeof mockAuth>) {
  Object.assign(mockAuth, {
    user: null, loading: false, isAuthenticated: false, isUnauthenticated: false, error: null,
  }, a);
}

describe("ProtectedRoute rate-limit resilience (#166)", () => {
  it("does NOT redirect on a transient error — shows a retry instead", () => {
    setAuth({ isAuthenticated: false, isUnauthenticated: false });
    render(<ProtectedRoute><div>secreto</div></ProtectedRoute>);
    expect(screen.getByText("Reintentar")).toBeInTheDocument();
    expect(hrefSetter).not.toHaveBeenCalled();
    expect(screen.queryByText("secreto")).toBeNull();
  });

  it("redirects to login only when definitively unauthenticated", () => {
    setAuth({ isAuthenticated: false, isUnauthenticated: true });
    render(<ProtectedRoute><div>secreto</div></ProtectedRoute>);
    expect(hrefSetter).toHaveBeenCalledWith("/login");
  });

  it("renders children when authenticated", () => {
    setAuth({ user: { role: "voluntario" }, isAuthenticated: true, isUnauthenticated: false });
    render(<ProtectedRoute><div>secreto</div></ProtectedRoute>);
    expect(screen.getByText("secreto")).toBeInTheDocument();
  });
});
