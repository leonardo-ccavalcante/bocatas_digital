/**
 * useSubmit.parse — the wizard must submit PersonCreateSchema.parse output,
 * never raw react-hook-form values ('' from untouched date inputs). F024/F047/F250.
 * jsdom env via the client/src/**\/*.test.tsx glob in vitest.config.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { PersonCreate } from "../../../schemas";
import { useRegistrationSubmit } from "../_useSubmit";

const {
  createPersonMock, enrollPersonMock, saveConsentsMock,
  createFamilyMock, uploadPhotoMock, navigateMock, toastMock,
} = vi.hoisted(() => ({
  createPersonMock: vi.fn(),
  enrollPersonMock: vi.fn(),
  saveConsentsMock: vi.fn(),
  createFamilyMock: vi.fn(),
  uploadPhotoMock: vi.fn(),
  navigateMock: vi.fn(),
  toastMock: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

vi.mock("wouter", () => ({ useLocation: () => ["/personas/nueva", navigateMock] }));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("../../../hooks/useCreatePerson", () => ({
  useCreatePerson: () => ({ mutateAsync: createPersonMock }),
}));
vi.mock("../../../hooks/useEnrollPerson", () => ({
  useEnrollPerson: () => ({ mutateAsync: enrollPersonMock }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    persons: {
      saveConsents: { useMutation: () => ({ mutateAsync: saveConsentsMock }) },
      createFamily: { useMutation: () => ({ mutateAsync: createFamilyMock }) },
      uploadPhoto: { useMutation: () => ({ mutateAsync: uploadPhotoMock }) },
    },
  },
}));

// Raw form values as react-hook-form yields them: untouched inputs are "".
const VALID_VALUES: PersonCreate = {
  canal_llegada: "boca_a_boca",
  nombre: "QA",
  apellidos: "Prueba",
  fecha_nacimiento: "1990-01-15",
  idioma_principal: "es",
  fecha_llegada_espana: "",
  email: "",
  codigo_postal: "",
  fase_itinerario: "acogida",
  program_ids: ["550e8400-e29b-41d4-a716-446655440000"],
};

function makeArgs(values: PersonCreate) {
  return {
    groupAAccepted: true,
    getValues: () => values,
    profilePhotoBase64: null,
    consentDocBase64: null,
    consentChoices: {},
    consentTemplatesEs: [],
    consentTemplatesLang: [],
    personLanguage: "es",
    numeroSerie: "",
    groupAPurposes: [],
    groupBPurposes: [],
    groupCPurposes: [],
    hasFamilia: false,
    familyMembers: [],
    numAdultos: 1,
    numMenores: 0,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  createPersonMock.mockResolvedValue({ id: "11111111-1111-1111-1111-111111111111", nombre: "QA", apellidos: "Prueba" });
  enrollPersonMock.mockResolvedValue(undefined);
  saveConsentsMock.mockResolvedValue(undefined);
});

describe("useRegistrationSubmit — submits parsed values (F024/F047/F250)", () => {
  it("an untouched 'Llegada a España' reaches persons.create as null, and the flow completes", async () => {
    const { result } = renderHook(() => useRegistrationSubmit(makeArgs(VALID_VALUES)));
    await act(async () => { await result.current.handleFinalSubmit(); });
    expect(createPersonMock).toHaveBeenCalledTimes(1);
    expect(createPersonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fecha_llegada_espana: null, nombre: "QA" }),
      })
    );
    expect(navigateMock).toHaveBeenCalledWith("/personas/11111111-1111-1111-1111-111111111111");
  });

  it("blocks submit with a Spanish field-list toast when values fail PersonCreateSchema", async () => {
    const invalid: PersonCreate = { ...VALID_VALUES, nombre: "" };
    const { result } = renderHook(() => useRegistrationSubmit(makeArgs(invalid)));
    await act(async () => { await result.current.handleFinalSubmit(); });
    expect(createPersonMock).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith(expect.stringContaining("nombre"));
  });
});
