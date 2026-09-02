/**
 * step0Canal.test.tsx — paso «Canal de llegada» del alta (reunión 31-08).
 *
 * Contratos:
 *   - «Motivo del retorno» sólo aparece con canal retorno_bocatas («Bocatas»)
 *     y escribe en motivo_retorno.
 *   - (Ciclo D) La entidad derivadora se asiste con el catálogo de
 *     instituciones sin perder el texto libre — sigue guardando TEXT.
 */
import React, { useMemo } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import type { PersonCreate } from "../../../schemas";

// ── stubs jsdom (mismo bloque que derivar/__tests__/InstitucionTypeahead) ──
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
global.ResizeObserver = global.ResizeObserver ?? ResizeObserverStub;
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

// ── mock tRPC (InstitucionTypeahead + su modal de creación) ────────────────
const { mockSearch, mockCreate } = vi.hoisted(() => ({
  mockSearch: vi.fn(),
  mockCreate: vi.fn(),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    instituciones: {
      search: { useQuery: mockSearch },
      create: { useMutation: mockCreate },
    },
  },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { Step0Canal } from "../steps/Step0Canal";

function Harness({ canal }: { canal: PersonCreate["canal_llegada"] }) {
  const defaults = useMemo(
    () => ({ canal_llegada: canal, program_ids: [] as string[] }),
    [canal]
  );
  const { register, watch, setValue, formState } = useForm<PersonCreate>({
    defaultValues: defaults,
  });
  return (
    <>
      <Step0Canal register={register} watch={watch} setValue={setValue} errors={formState.errors} />
      <span data-testid="motivo-actual">{watch("motivo_retorno") ?? ""}</span>
      <span data-testid="entidad-actual">{watch("entidad_derivadora") ?? ""}</span>
    </>
  );
}

afterEach(() => { cleanup(); vi.clearAllMocks(); });

function armarMocks(resultados: unknown[] = []) {
  mockSearch.mockReturnValue({ data: resultados });
  mockCreate.mockReturnValue({ isPending: false, mutateAsync: vi.fn() });
}

describe("Step0Canal — motivo del retorno", () => {
  it("no aparece con un canal distinto de retorno_bocatas", () => {
    armarMocks();
    render(<Harness canal="boca_a_boca" />);
    expect(screen.queryByLabelText(/Motivo del retorno/)).toBeNull();
  });

  it("con canal «Bocatas» aparece y escribe en motivo_retorno", async () => {
    armarMocks();
    const user = userEvent.setup();
    render(<Harness canal="retorno_bocatas" />);
    const area = screen.getByLabelText(/Motivo del retorno/);
    await user.type(area, "Vuelve tras una temporada fuera");
    expect(screen.getByTestId("motivo-actual").textContent).toBe(
      "Vuelve tras una temporada fuera"
    );
  });
});
