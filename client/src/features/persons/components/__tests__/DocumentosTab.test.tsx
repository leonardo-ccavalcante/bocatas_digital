/**
 * DocumentosTab + PersonDocumentsModal — quién ve las imágenes archivadas.
 *
 * Lo que sustituyen: un `<a target="_blank">` a la URL firmada que getById
 * metía en la ficha, visible para admin Y superadmin, que abría el enlace en
 * otra pestaña y no dejaba rastro de quién lo miró.
 *
 * A un admin se le dice «acceso restringido», NUNCA «sin documentos»: decirle
 * que no hay documentos cuando sí los hay es fabricar datos.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mockDocumentos } = vi.hoisted(() => ({ mockDocumentos: vi.fn() }));

vi.mock("@/lib/trpc", () => ({
  trpc: { persons: { getDocumentUrls: { useQuery: mockDocumentos } } },
}));

import { DocumentosTab } from "../detail/DocumentosTab";

const PERSON_ID = "11111111-1111-1111-1111-111111111111";

const IDENTIDAD = {
  kind: "identidad" as const,
  purposes: [],
  url: "https://firmada/dni.jpg",
  archivadoEn: "2026-01-15T00:00:00Z",
};
const CONSENTIMIENTO = {
  kind: "consentimiento" as const,
  purposes: ["fotografia", "tratamiento_datos_bocatas"],
  url: "https://firmada/hoja.jpg",
  archivadoEn: "2026-01-10T00:00:00Z",
};

function pintar(isSuperadmin: boolean, documentos: unknown[] = []) {
  mockDocumentos.mockReturnValue({
    data: { documentos },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  });
  return render(
    <DocumentosTab personId={PERSON_ID} nombreCompleto="Ana García" isSuperadmin={isSuperadmin} />
  );
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("DocumentosTab — quién puede ver", () => {
  it("un admin ve «acceso restringido», nunca «sin documentos»", () => {
    pintar(false, [IDENTIDAD]);
    expect(screen.getByText("Acceso restringido")).toBeInTheDocument();
    expect(screen.queryByText("Sin documentos")).toBeNull();
    expect(screen.queryByRole("button", { name: "Ver" })).toBeNull();
  });

  it("a un no-superadmin ni siquiera se le lanza la consulta", () => {
    pintar(false, []);
    expect(mockDocumentos).toHaveBeenCalledWith(
      { personId: PERSON_ID },
      expect.objectContaining({ enabled: false })
    );
  });

  it("un superadmin sin documentos ve el estado vacío honesto", () => {
    pintar(true, []);
    expect(screen.getByText("Sin documentos")).toBeInTheDocument();
  });

  it("un superadmin ve las dos especies de documento", () => {
    pintar(true, [IDENTIDAD, CONSENTIMIENTO]);
    expect(screen.getByText("Documento de identidad")).toBeInTheDocument();
    expect(screen.getByText("Consentimiento firmado")).toBeInTheDocument();
  });
});

describe("DocumentosTab — el visor es in-app", () => {
  it("«Ver» abre un diálogo, no una pestaña nueva", async () => {
    pintar(true, [IDENTIDAD]);
    // Nada de <a target="_blank">: eso dejaba la URL firmada en la barra de
    // direcciones y fuera de todo control.
    expect(screen.queryByRole("link")).toBeNull();

    await userEvent.click(screen.getAllByRole("button", { name: "Ver" })[0]);
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByAltText(/Foto archivada del documento de identidad/i)).toBeInTheDocument();
  });

  it("la imagen se puede girar (una foto de DNI sale en horizontal)", async () => {
    pintar(true, [IDENTIDAD]);
    await userEvent.click(screen.getAllByRole("button", { name: "Ver" })[0]);
    const dialogo = await screen.findByRole("dialog");

    const imagen = within(dialogo).getByAltText(/Foto archivada/i);
    expect(imagen).toHaveStyle({ transform: "rotate(0deg) scale(1)" });
    await userEvent.click(within(dialogo).getByRole("button", { name: "Girar el documento" }));
    expect(imagen).toHaveStyle({ transform: "rotate(90deg) scale(1)" });
  });

  it("un documento que consta pero no se pudo firmar NO se esconde", async () => {
    // "Consta y no abre" ≠ "no hay nada": confundirlos lleva a concluir que la
    // foto nunca se tomó.
    pintar(true, [{ ...IDENTIDAD, url: null }]);
    await userEvent.click(screen.getAllByRole("button", { name: "Ver" })[0]);
    const dialogo = await screen.findByRole("dialog");

    expect(within(dialogo).getByText(/consta en la ficha pero no se pudo abrir/i)).toBeInTheDocument();
    expect(within(dialogo).queryByAltText(/Foto archivada/i)).toBeNull();
  });

  it("el diálogo avisa de que la autorización no consta (#149)", async () => {
    pintar(true, [IDENTIDAD]);
    await userEvent.click(screen.getAllByRole("button", { name: "Ver" })[0]);
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText(/requiere autorización expresa/i)).toBeInTheDocument();
  });
});
