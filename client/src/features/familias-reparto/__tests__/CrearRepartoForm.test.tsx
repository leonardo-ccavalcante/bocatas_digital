import { render, screen, fireEvent, within, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";

afterEach(cleanup);
import { CrearRepartoForm } from "../components/CrearRepartoForm";

vi.mock("@/lib/trpc", () => ({
  trpc: {
    families: {
      createRound: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) },
      listRounds: { useQuery: () => ({ data: [], isLoading: false }) },
    },
    useUtils: () => ({ families: { listRounds: { invalidate: vi.fn() } } }),
  },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe("CrearRepartoForm — slot-based model", () => {
  it("renders the operator inputs for the Hoja de Firmas", () => {
    render(<CrearRepartoForm programId="00000000-0000-0000-0000-000000000001" onCreated={vi.fn()} />);
    expect(screen.getByLabelText(/Nombre/i)).toBeTruthy();
    expect(screen.getByLabelText(/Mes de reparto/i)).toBeTruthy();
    expect(screen.getByLabelText(/Kg totales de alimentos/i)).toBeTruthy();
    expect(screen.getByLabelText(/albarán Banco de Alimentos/i)).toBeTruthy();
  });

  it("renders the month picker (type=month) instead of fecha_inicio + dias_reparto", () => {
    render(<CrearRepartoForm programId="00000000-0000-0000-0000-000000000001" onCreated={vi.fn()} />);
    const monthInput = screen.getByLabelText(/Mes de reparto/i);
    expect((monthInput as HTMLInputElement).type).toBe("month");
    // Old inputs must NOT be present
    expect(screen.queryByLabelText(/Fecha de inicio/i)).toBeNull();
    expect(screen.queryByLabelText(/Días de reparto/i)).toBeNull();
  });

  it("asks for the total people to serve", () => {
    render(<CrearRepartoForm programId="00000000-0000-0000-0000-000000000001" onCreated={vi.fn()} />);
    expect(screen.getByLabelText(/Total de personas a atender/i)).toBeTruthy();
  });

  it("gates day selection until a total is entered, then reveals the day grid", () => {
    render(<CrearRepartoForm programId="00000000-0000-0000-0000-000000000001" onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Mes de reparto/i), { target: { value: "2026-06" } });
    // month picked but no total yet → gate hint, no day grid
    expect(screen.getByText(/Primero indica cuántas personas/i)).toBeTruthy();
    expect(screen.queryByRole("group", { name: /Días del mes/i })).toBeNull();
    // enter the total → the day grid appears
    fireEvent.change(screen.getByLabelText(/Total de personas a atender/i), { target: { value: "200" } });
    expect(screen.getByRole("group", { name: /Días del mes/i })).toBeTruthy();
  });

  it("opens the Visualizar preview with the distributed slots", async () => {
    render(<CrearRepartoForm programId="00000000-0000-0000-0000-000000000001" onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Mes de reparto/i), { target: { value: "2026-06" } });
    fireEvent.change(screen.getByLabelText(/Total de personas a atender/i), { target: { value: "200" } });
    // pick the first day cell → one slot carrying all 200 people
    const grid = screen.getByRole("group", { name: /Días del mes/i });
    fireEvent.click(within(grid).getAllByRole("button")[0]);
    expect(screen.getByText(/Turnos y personas por día/i)).toBeTruthy();
    // open the read-only recap
    fireEvent.click(screen.getByRole("button", { name: /^Visualizar$/i }));
    expect(await screen.findByText(/Vista previa del reparto/i)).toBeTruthy();
    expect(screen.getByText(/200 pers\./i)).toBeTruthy();
  });

  it("reserves the first slot for fuera de Madrid and rebalances the rest", () => {
    render(<CrearRepartoForm programId="00000000-0000-0000-0000-000000000001" onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Mes de reparto/i), { target: { value: "2026-06" } });
    fireEvent.change(screen.getByLabelText(/Total de personas a atender/i), { target: { value: "200" } });
    // pick two days → two mañana slots
    const grid = screen.getByRole("group", { name: /Días del mes/i });
    const dayButtons = within(grid).getAllByRole("button");
    fireEvent.click(dayButtons[0]);
    fireEvent.click(dayButtons[1]);
    // enable fuera de Madrid with a count of 20
    fireEvent.click(screen.getByRole("button", { name: /Hay personas de fuera de Madrid/i }));
    fireEvent.change(screen.getByLabelText(/¿Cuántas/i), { target: { value: "20" } });
    // first slot card carries the "Fuera de Madrid" badge, and the two turnos
    // are 20 (fuera) + 180 (Madrid)
    expect(screen.getByText("Fuera de Madrid")).toBeTruthy();
    const nums = screen.getAllByRole("spinbutton").map((el) => (el as HTMLInputElement).value);
    expect(nums).toContain("20");
    expect(nums).toContain("180");
  });
});
