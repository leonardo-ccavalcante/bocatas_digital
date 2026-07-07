import { useState } from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect } from "vitest";
import { RepartoNumberList } from "../components/RepartoNumberList";

afterEach(cleanup);

function Harness() {
  const [v, setV] = useState<string[]>([]);
  return (
    <RepartoNumberList label="Albarán" addLabel="Añadir albarán" values={v} onChange={setV} max={4} />
  );
}

describe("RepartoNumberList — repeatable up to max", () => {
  const addBtn = () => screen.queryByRole("button", { name: /Añadir albarán/i });

  it("starts with one row and no remove button", () => {
    render(<Harness />);
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Quitar/i })).toBeNull();
  });

  it("adds rows up to the max, then hides the add button", () => {
    render(<Harness />);
    fireEvent.click(addBtn()!); // 2
    fireEvent.click(addBtn()!); // 3
    fireEvent.click(addBtn()!); // 4
    expect(screen.getAllByRole("textbox")).toHaveLength(4);
    expect(addBtn()).toBeNull(); // capped at 4
  });

  it("removes a row and shows the add button again", () => {
    render(<Harness />);
    fireEvent.click(addBtn()!);
    fireEvent.click(addBtn()!);
    fireEvent.click(addBtn()!); // 4 rows, add hidden
    fireEvent.click(screen.getAllByRole("button", { name: /Quitar/i })[0]);
    expect(screen.getAllByRole("textbox")).toHaveLength(3);
    expect(addBtn()).not.toBeNull();
  });
});
