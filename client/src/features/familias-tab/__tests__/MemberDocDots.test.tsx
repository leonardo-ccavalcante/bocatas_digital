/**
 * Tests for <MemberDocDots /> + computeMemberDocStates.
 *
 * The dots MUST reflect real `family_member_documents` presence — never a
 * fabricated state. These tests pin the no-fabrication contract:
 *   - uploaded tipo  → green/ok=true
 *   - missing tipo (adult, required) → red/ok=false
 *   - minor consents → neutral/ok=null ("no aplica")
 */

import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  MemberDocDots,
  computeMemberDocStates,
} from "../MemberDocDots";

afterEach(cleanup);

// Adult born well over 14 years before today.
const ADULT_DOB = "1990-01-01";
// Minor born well under 14 years before today.
const MINOR_DOB = "2020-01-01";

describe("computeMemberDocStates", () => {
  it("adult with all docs uploaded → all ok=true, required=3", () => {
    const { docs, adult } = computeMemberDocStates(
      new Set(["documento_identidad", "consent_bocatas", "consent_banco_alimentos"]),
      ADULT_DOB,
    );
    expect(adult).toBe(true);
    expect(docs.map((d) => d.ok)).toEqual([true, true, true]);
  });

  it("adult with no docs → all ok=false (pending, not fabricated complete)", () => {
    const { docs } = computeMemberDocStates(new Set(), ADULT_DOB);
    expect(docs.map((d) => d.ok)).toEqual([false, false, false]);
  });

  it("adult with partial docs reflects exactly the uploaded tipos", () => {
    const { docs } = computeMemberDocStates(new Set(["documento_identidad"]), ADULT_DOB);
    expect(docs.find((d) => d.key === "documento_identidad")?.ok).toBe(true);
    expect(docs.find((d) => d.key === "consent_bocatas")?.ok).toBe(false);
    expect(docs.find((d) => d.key === "consent_banco_alimentos")?.ok).toBe(false);
  });

  it("minor → consents are ok=null (no aplica); identity follows uploaded set", () => {
    const { docs, adult } = computeMemberDocStates(new Set(), MINOR_DOB);
    expect(adult).toBe(false);
    expect(docs.find((d) => d.key === "consent_bocatas")?.ok).toBeNull();
    expect(docs.find((d) => d.key === "consent_banco_alimentos")?.ok).toBeNull();
    expect(docs.find((d) => d.key === "documento_identidad")?.ok).toBe(false);
  });

  it("unknown DOB is treated as adult (inclusive — shows requirement)", () => {
    const { adult } = computeMemberDocStates(new Set(), null);
    expect(adult).toBe(true);
  });
});

describe("<MemberDocDots />", () => {
  it("renders a count of completed/required for an adult", () => {
    render(
      <MemberDocDots
        uploadedTipos={new Set(["documento_identidad", "consent_bocatas"])}
        fechaNacimiento={ADULT_DOB}
      />,
    );
    expect(screen.getByText("2/3")).toBeInTheDocument();
  });

  it("renders 'no aplica' for a minor", () => {
    render(<MemberDocDots uploadedTipos={new Set()} fechaNacimiento={MINOR_DOB} />);
    expect(screen.getByText("no aplica")).toBeInTheDocument();
  });

  it("each dot exposes an accessible status label (no color-only signal)", () => {
    render(
      <MemberDocDots
        uploadedTipos={new Set(["documento_identidad"])}
        fechaNacimiento={ADULT_DOB}
      />,
    );
    expect(screen.getByLabelText(/DNI \/ Pasaporte: entregado/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Consent\. Bocatas: pendiente/i)).toBeInTheDocument();
  });
});
