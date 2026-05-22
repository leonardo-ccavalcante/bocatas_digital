import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
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

describe("CrearRepartoForm", () => {
  it("renders the operator inputs that drive the Hoja de Firmas", () => {
    render(<CrearRepartoForm programId="00000000-0000-0000-0000-000000000001" onCreated={vi.fn()} />);
    expect(screen.getByLabelText(/Nombre/i)).toBeTruthy();
    expect(screen.getByLabelText(/Fecha de inicio/i)).toBeTruthy();
    expect(screen.getByLabelText(/Días de reparto/i)).toBeTruthy();
    expect(screen.getByLabelText(/Kg totales de alimentos/i)).toBeTruthy();
    expect(screen.getByLabelText(/albarán Banco de Alimentos/i)).toBeTruthy();
  });
});
