/** TEMP repro — delete after. */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("wouter", () => ({
  useLocation: () => ["/personas/nueva", vi.fn()],
  Link: ({ children }: { children?: ReactNode }) => <a>{children}</a>,
}));

vi.mock("../../../utils/imageUtils", () => ({
  compressImage: vi.fn(async () => "FAKEBASE64"),
}));

const OCR_DATA = {
  nombre: "Fatima",
  apellidos: "El Amrani",
  fecha_nacimiento: "1990-05-12",
  tipo_documento: "dni",
  numero_documento: "12345678A",
  pais_origen: "MA",
  pais_documento: "MA",
  genero: "femenino",
};

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ auth: { me: { setData: vi.fn(), invalidate: vi.fn() } } }),
    auth: {
      me: { useQuery: () => ({ data: null, isLoading: false, error: null, refetch: vi.fn() }) },
      logout: { useMutation: () => ({ isPending: false, error: null, mutate: vi.fn() }) },
    },
    persons: {
      programs: { useQuery: () => ({ data: [], isLoading: false }) },
      consentTemplates: { useQuery: () => ({ data: [], isLoading: false }) },
      findDuplicates: { useQuery: () => ({ data: [], isLoading: false }) },
      create: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) },
      enroll: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) },
      saveConsents: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      createFamily: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      uploadPhoto: { useMutation: () => ({ mutateAsync: vi.fn() }) },
    },
    ocr: {
      extractDocument: {
        useMutation: () => ({
          isPending: false,
          mutate: (
            _vars: unknown,
            opts?: { onSuccess?: (r: unknown) => void }
          ) => {
            opts?.onSuccess?.({ success: true, data: OCR_DATA });
          },
        }),
      },
    },
  },
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ value, children }: { value: string; children?: ReactNode }) => (
    <div data-current-value={value}>{children}</div>
  ),
  SelectTrigger: ({ id, children }: { id?: string; children?: ReactNode }) => (
    <button type="button" id={id}>{children}</button>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  SelectContent: ({ children }: { children?: ReactNode }) => <>{children}</>,
  SelectItem: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

import { RegistrationWizard } from "../index";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("repro: archivar checkbox reachability", () => {
  it("shows the archivar checkbox after a successful OCR", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <RegistrationWizard />
      </QueryClientProvider>,
    );

    const fileInputs = container.querySelectorAll<HTMLInputElement>('input[type="file"]');
    // eslint-disable-next-line no-console
    console.log("file inputs:", fileInputs.length);
    const file = new File(["x"], "dni.jpg", { type: "image/jpeg" });
    await user.upload(fileInputs[0], file);

    const extractBtn = await screen.findByRole("button", { name: /Extraer datos/i });
    await user.click(extractBtn);

    await waitFor(() => {
      expect(screen.getAllByText(/Datos extraídos/i).length).toBeGreaterThan(0);
    });

    // eslint-disable-next-line no-console
    console.log("checkboxes:", screen.queryAllByText(/Archivar la foto/i).length);
    expect(screen.queryAllByText(/Archivar la foto/i).length).toBeGreaterThan(0);
  });
});
