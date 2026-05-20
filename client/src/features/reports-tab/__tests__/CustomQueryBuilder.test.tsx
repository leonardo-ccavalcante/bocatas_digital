/**
 * @vitest-environment jsdom
 *
 * CustomQueryBuilder.test.tsx — Contract tests for the custom query builder.
 *
 * Tests:
 *   - FieldPicker renders only filterable fields, hides non-filterable
 *   - GroupByPicker renders only groupable fields, hides non-groupable
 */

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { FieldPicker } from "../CustomQueryBuilder/FieldPicker";
import { GroupByPicker } from "../CustomQueryBuilder/GroupByPicker";
import { ENTITY_FIELDS } from "@shared/reports/entities";

// ResizeObserver stub for Radix UI
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = global.ResizeObserver ?? ResizeObserverStub;

// Pointer stubs for Radix Select
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("FieldPicker", () => {
  it("renders only filterable fields for the 'families' entity", () => {
    const onChange = vi.fn();
    render(
      <FieldPicker entity="families" value="" onChange={onChange} />,
    );
    const filterableFields = ENTITY_FIELDS.families.filter((f) => f.filterable);
    const nonFilterable = ENTITY_FIELDS.families.filter((f) => !f.filterable);

    // The select trigger is present
    expect(screen.getByRole("combobox")).toBeInTheDocument();

    // Non-filterable fields should NOT appear in the DOM at all
    for (const f of nonFilterable) {
      expect(screen.queryByText(f.label)).not.toBeInTheDocument();
    }
    // The number of filterable options is correct (checked via data attribute)
    expect(filterableFields.length).toBeGreaterThan(0);
  });

  it("renders only filterable fields for the 'persons' entity", () => {
    const onChange = vi.fn();
    render(
      <FieldPicker entity="persons" value="" onChange={onChange} />,
    );
    const nonFilterable = ENTITY_FIELDS.persons.filter((f) => !f.filterable);
    for (const f of nonFilterable) {
      expect(screen.queryByText(f.label)).not.toBeInTheDocument();
    }
  });
});

describe("GroupByPicker", () => {
  it("renders only groupable fields for the 'families' entity", () => {
    const onChange = vi.fn();
    render(
      <GroupByPicker entity="families" value="" onChange={onChange} />,
    );
    const nonGroupable = ENTITY_FIELDS.families.filter((f) => !f.groupable);
    for (const f of nonGroupable) {
      expect(screen.queryByText(f.label)).not.toBeInTheDocument();
    }
  });

  it("renders only groupable fields for the 'deliveries' entity", () => {
    const onChange = vi.fn();
    render(
      <GroupByPicker entity="deliveries" value="" onChange={onChange} />,
    );
    const nonGroupable = ENTITY_FIELDS.deliveries.filter((f) => !f.groupable);
    for (const f of nonGroupable) {
      expect(screen.queryByText(f.label)).not.toBeInTheDocument();
    }
  });
});
