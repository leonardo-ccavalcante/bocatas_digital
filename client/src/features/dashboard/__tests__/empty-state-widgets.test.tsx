/**
 * empty-state-widgets.test.tsx — Real render tests for the three
 * placeholder widgets (CohortRetentionPanel, HourlyDistributionChart,
 * SedesPerformanceTable).
 *
 * Uses @testing-library/react + jsdom (via environmentMatchGlobs for .test.tsx).
 * Verifies each component renders its container with the correct aria-label
 * and shows the expected placeholder message text.
 */

import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CohortRetentionPanel } from "../components/CohortRetentionPanel";
import { HourlyDistributionChart } from "../components/HourlyDistributionChart";
import { SedesPerformanceTable } from "../components/SedesPerformanceTable";

afterEach(cleanup);

// ─── CohortRetentionPanel ──────────────────────────────────────────────────────

describe("CohortRetentionPanel — empty-state render", () => {
  it("renders the section with aria-label 'Cohortes de retención'", () => {
    render(<CohortRetentionPanel />);
    expect(
      screen.getByRole("region", { name: "Cohortes de retención" })
    ).toBeInTheDocument();
  });

  it("renders the placeholder message text", () => {
    render(<CohortRetentionPanel />);
    expect(screen.getByText("Pendiente de implementación")).toBeInTheDocument();
  });

  it("renders activeCount when provided", () => {
    render(<CohortRetentionPanel activeCount={42} />);
    expect(screen.getByText(/42/)).toBeInTheDocument();
  });
});

// ─── HourlyDistributionChart ───────────────────────────────────────────────────

describe("HourlyDistributionChart — empty-state render", () => {
  it("renders the section with aria-label 'Distribución horaria'", () => {
    render(<HourlyDistributionChart />);
    expect(
      screen.getByRole("region", { name: "Distribución horaria" })
    ).toBeInTheDocument();
  });

  it("renders the placeholder message text", () => {
    render(<HourlyDistributionChart />);
    expect(screen.getByText("Pendiente de implementación")).toBeInTheDocument();
  });
});

// ─── SedesPerformanceTable ─────────────────────────────────────────────────────

describe("SedesPerformanceTable — empty-state render", () => {
  it("renders the section with aria-label 'Rendimiento por sede'", () => {
    render(<SedesPerformanceTable />);
    expect(
      screen.getByRole("region", { name: "Rendimiento por sede" })
    ).toBeInTheDocument();
  });

  it("renders the placeholder message text", () => {
    render(<SedesPerformanceTable />);
    expect(screen.getByText("Pendiente de implementación")).toBeInTheDocument();
  });
});
