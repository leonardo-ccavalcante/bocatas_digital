import { render, screen, fireEvent, within, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";

afterEach(cleanup);
import { CrearRepartoForm } from "../components/CrearRepartoForm";

vi.mock("@/lib/trpc", () => ({
  trpc: {
    families: {
      createRound: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) },
      listRounds: { useQuery: () => ({ data: [], isLoading: false }) },
      getEligibleFamilies: {
        useQuery: () => ({
          data: [
            { id: "f1", familia_numero: 1, total_miembros: 3, es_fuera_madrid: false },
            { id: "f2", familia_numero: 2, total_miembros: 4, es_fuera_madrid: false },
          ],
          isLoading: false,
        }),
      },
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

  it("shows the live active-families banner instead of a total-personas input", () => {
    render(<CrearRepartoForm programId="00000000-0000-0000-0000-000000000001" onCreated={vi.fn()} />);
    // Old total-personas input must NOT be present
    expect(screen.queryByLabelText(/Total de personas a atender/i)).toBeNull();
    // Live banner must be present (role=status — families are loaded from the mock)
    const banner = screen.getByRole("status");
    expect(banner).toBeTruthy();
    // Banner should mention "familias activas"
    expect(banner.textContent).toMatch(/familias? activas?/i);
  });

  it("reveals the day grid as soon as a month is selected, without needing a total", () => {
    render(<CrearRepartoForm programId="00000000-0000-0000-0000-000000000001" onCreated={vi.fn()} />);
    // No month selected → no grid yet
    expect(screen.queryByRole("group", { name: /Días del mes/i })).toBeNull();
    // Pick a month → grid appears immediately (no total required)
    fireEvent.change(screen.getByLabelText(/Mes de reparto/i), { target: { value: "2026-06" } });
    expect(screen.getByRole("group", { name: /Días del mes/i })).toBeTruthy();
    // The old "Primero indica cuántas personas" hint must be gone
    expect(screen.queryByText(/Primero indica cuántas personas/i)).toBeNull();
  });

  it("opens the Visualizar preview listing the slot structure", async () => {
    render(<CrearRepartoForm programId="00000000-0000-0000-0000-000000000001" onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Mes de reparto/i), { target: { value: "2026-06" } });
    const grid = screen.getByRole("group", { name: /Días del mes/i });
    // Pick first day cell
    fireEvent.click(within(grid).getAllByRole("button")[0]);
    expect(screen.getByText(/Turnos por día/i)).toBeTruthy();
    // Open the read-only recap dialog
    fireEvent.click(screen.getByRole("button", { name: /^Visualizar$/i }));
    expect(await screen.findByText(/Vista previa del reparto/i)).toBeTruthy();
    // Dialog should mention the slot turno (Mañana is the default)
    expect(screen.getAllByText(/Mañana/i).length).toBeGreaterThan(0);
    // Old per-slot people badge must NOT appear
    expect(screen.queryByText(/pers\./i)).toBeNull();
  });

  it("marks the first slot as fuera-de-Madrid when the toggle is enabled", () => {
    render(<CrearRepartoForm programId="00000000-0000-0000-0000-000000000001" onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Mes de reparto/i), { target: { value: "2026-06" } });
    // Pick two days
    const grid = screen.getByRole("group", { name: /Días del mes/i });
    const dayButtons = within(grid).getAllByRole("button");
    fireEvent.click(dayButtons[0]);
    fireEvent.click(dayButtons[1]);
    // Enable fuera de Madrid toggle
    fireEvent.click(screen.getByRole("button", { name: /Hay personas de fuera de Madrid/i }));
    // The first slot row must carry the "Fuera de Madrid" badge
    expect(screen.getByText("Fuera de Madrid")).toBeTruthy();
    // No numeric cupo inputs for personas (cupos are server-side now)
    expect(screen.queryAllByRole("spinbutton", { name: /Personas/i })).toHaveLength(0);
  });
});
