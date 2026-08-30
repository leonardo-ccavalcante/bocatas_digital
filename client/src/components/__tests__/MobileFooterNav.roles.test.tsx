/**
 * MobileFooterNav.roles.test.tsx — RC-07 (F011/F113).
 * El pie móvil debe filtrar pestañas por rol: un beneficiario no debe ver
 * Check-in ni Personas (sus procedimientos de servidor son voluntario/admin-only).
 */
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import MobileFooterNav from "../layout/MobileFooterNav";

afterEach(cleanup);

describe("MobileFooterNav — pestañas filtradas por rol", () => {
  it("beneficiario: solo ve Inicio (sin Check-in ni Personas)", () => {
    render(<MobileFooterNav role="beneficiario" />);
    expect(screen.getByText("Inicio")).toBeInTheDocument();
    expect(screen.queryByText("Check-in")).toBeNull();
    expect(screen.queryByText("Personas")).toBeNull();
  });

  it("voluntario: ve Inicio, Check-in y Personas", () => {
    render(<MobileFooterNav role="voluntario" />);
    expect(screen.getByText("Inicio")).toBeInTheDocument();
    expect(screen.getByText("Check-in")).toBeInTheDocument();
    expect(screen.getByText("Personas")).toBeInTheDocument();
  });

  it("admin: ve las tres pestañas", () => {
    render(<MobileFooterNav role="admin" />);
    expect(screen.getByText("Check-in")).toBeInTheDocument();
    expect(screen.getByText("Personas")).toBeInTheDocument();
  });
});
