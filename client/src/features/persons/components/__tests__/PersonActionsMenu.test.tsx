/**
 * PersonActionsMenu — el `⋯` del listado tiene que abrir algo de verdad.
 *
 * Lo que sustituye estaba roto en las dos superficies:
 *  · escritorio: acciones `opacity-0 group-hover:opacity-100`, invisibles sin
 *    ratón — o sea, nunca visibles en una tableta o un teléfono;
 *  · móvil: el `⋯` era un `<span aria-hidden>` decorativo que no hacía nada.
 *
 * Se monta la tarjeta y la fila REALES, no el menú suelto: lo que hay que
 * demostrar es que se LLEGA al menú desde donde está el usuario
 * (AGENTS.md §"Test reachability, not just units").
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mockUseAuth, mockNavigate, mockIdsConDocumentos } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockNavigate: vi.fn(),
  mockIdsConDocumentos: vi.fn(),
}));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: mockUseAuth }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    persons: {
      getPersonIdsWithDocuments: { useQuery: mockIdsConDocumentos },
      getDocumentUrls: { useQuery: () => ({ data: undefined, isLoading: false }) },
    },
  },
}));
vi.mock("wouter", () => ({
  useLocation: () => ["/personas", mockNavigate],
}));

import { PersonCardMobile } from "../PersonCardMobile";
import { PersonRowDesktop, type PersonRowData } from "../PersonRowDesktop";

const PERSON: PersonRowData = {
  id: "11111111-1111-1111-1111-111111111111",
  nombre: "Ana",
  apellidos: "García",
  fase_itinerario: "acogida",
  created_at: "2026-08-01T00:00:00Z",
} as PersonRowData;

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: { role: "admin" } });
  mockIdsConDocumentos.mockReturnValue({ data: undefined, isSuccess: false });
});
afterEach(() => cleanup());

const abrirMenu = async () => {
  const trigger = screen.getByRole("button", { name: /Acciones de Ana García/i });
  await userEvent.click(trigger);
  return trigger;
};

describe("PersonCardMobile — el `⋯` ya no es decorativo", () => {
  it("expone un disparador accesible (antes era aria-hidden)", () => {
    render(<PersonCardMobile person={PERSON} />);
    expect(screen.getByRole("button", { name: /Acciones de Ana García/i })).toBeInTheDocument();
  });

  it("abrir el menú NO navega a la ficha", async () => {
    render(<PersonCardMobile person={PERSON} />);
    await abrirMenu();
    // El contenedor externo ya no es role="button"; si lo fuera, este clic
    // habría disparado también su navegación.
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("la zona de navegación y el menú son objetivos SEPARADOS", async () => {
    render(<PersonCardMobile person={PERSON} />);
    const zona = screen.getByRole("button", { name: /Ver ficha de Ana García/i });
    const trigger = screen.getByRole("button", { name: /Acciones de Ana García/i });
    // Interactivo anidado = lo que bloquea el gate de accesibilidad.
    expect(zona.contains(trigger)).toBe(false);
    expect(trigger.contains(zona)).toBe(false);
  });

  it("un admin ve editar; el menú lleva a la ficha con el modal abierto", async () => {
    render(<PersonCardMobile person={PERSON} />);
    await abrirMenu();
    await userEvent.click(await screen.findByRole("menuitem", { name: /Editar ficha/i }));
    expect(mockNavigate).toHaveBeenCalledWith(`/personas/${PERSON.id}?editar=1`);
  });

  it("el QR de ESTA persona se alcanza desde el listado", async () => {
    render(<PersonCardMobile person={PERSON} />);
    await abrirMenu();
    await userEvent.click(await screen.findByRole("menuitem", { name: /Ver QR/i }));
    expect(mockNavigate).toHaveBeenCalledWith(`/personas/${PERSON.id}/qr`);
  });

  it("un voluntario no ve «Editar ficha»", async () => {
    mockUseAuth.mockReturnValue({ user: { role: "voluntario" } });
    render(<PersonCardMobile person={PERSON} />);
    await abrirMenu();
    expect(await screen.findByRole("menuitem", { name: /Ver ficha/i })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Editar ficha/i })).toBeNull();
  });
});

describe("PersonRowDesktop — las acciones dejan de depender del ratón", () => {
  it("el menú está presente sin necesidad de hover", () => {
    render(<PersonRowDesktop person={PERSON} active={false} compact={false} onMouseEnter={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: /Acciones de Ana García/i });
    // `opacity-0` era el defecto: sin puntero nunca se revelaba.
    expect(trigger.closest('[class*="opacity-0"]')).toBeNull();
  });

  it("desde la fila se llega a editar", async () => {
    render(<PersonRowDesktop person={PERSON} active={false} compact={false} onMouseEnter={vi.fn()} />);
    await abrirMenu();
    await userEvent.click(await screen.findByRole("menuitem", { name: /Editar ficha/i }));
    expect(mockNavigate).toHaveBeenCalledWith(`/personas/${PERSON.id}?editar=1`);
  });
});
