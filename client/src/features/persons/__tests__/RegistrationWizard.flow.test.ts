/**
 * RegistrationWizard.flow.test — submission-flow contract test.
 *
 * The repo runs vitest in `node` env (no jsdom), so we cannot mount the
 * full wizard. Instead we model the wizard's submit-time orchestration
 * (the `handleFinalSubmit` callback) and pin its observable contract:
 *
 *   1. The submit guard (groupAAccepted=false) blocks createPerson.
 *   2. On a clean run, createPerson is called exactly once with the form
 *      payload, including the resolved foto_perfil_url.
 *   3. After person creation, programs are enrolled and consents saved
 *      against the new person.id.
 *
 * Pattern source: client/src/features/persons/__tests__/duplicate-creation.test.ts
 */
import { describe, it, expect, vi } from "vitest";
import { buildConsentRows } from "../components/RegistrationWizard/_consentRows";
import type { ConsentTemplate } from "../schemas";

// ─── Types that mirror the wizard's submit-time inputs ─────────────────────

interface SubmitPayload {
  canal_llegada: "boca_a_boca";
  nombre: string;
  apellidos: string;
  fecha_nacimiento: string;
  idioma_principal: "es" | "fr" | "wo";
  program_ids: string[];
}

interface SubmitDeps {
  isSubmitting: boolean;
  groupAAccepted: boolean;
  data: SubmitPayload;
  profilePhotoBase64: string | null;
  consentChoices: Record<string, boolean>;
  consentTemplatesEs: ConsentTemplate[];
  consentTemplatesLang: ConsentTemplate[];
  numeroSerie: string;
  uploadPhoto: ReturnType<typeof vi.fn>;
  createPerson: ReturnType<typeof vi.fn>;
  enrollPerson: ReturnType<typeof vi.fn>;
  saveConsents: ReturnType<typeof vi.fn>;
  toastError: ReturnType<typeof vi.fn>;
}

const GROUP_A = ["tratamiento_datos_bocatas", "fotografia", "comunicaciones_whatsapp"];
const GRANTED_AT = "2026-01-01T00:00:00.000Z";

function template(
  purpose: ConsentTemplate["purpose"],
  idioma: ConsentTemplate["idioma"],
  textContent: string
): ConsentTemplate {
  return {
    id: "550e8400-e29b-41d4-a716-446655440000",
    purpose,
    idioma,
    version: `1.0-${idioma}`,
    text_content: textContent,
    is_active: true,
    updated_at: null,
  };
}

/**
 * Reproduces the essential branches of RegistrationWizard.handleFinalSubmit
 * (see RegistrationWizard.tsx line 337) so we can lock them down without
 * mounting the component.
 */
async function runHandleFinalSubmit(deps: SubmitDeps): Promise<void> {
  if (deps.isSubmitting) return;
  if (!deps.groupAAccepted) {
    deps.toastError("Debes aceptar los consentimientos del Grupo A para continuar.");
    return;
  }

  let fotoPerfilUrl: string | null = null;
  if (deps.profilePhotoBase64) {
    const uploaded = await deps.uploadPhoto({
      bucket: "fotos-perfil",
      base64: deps.profilePhotoBase64,
    });
    fotoPerfilUrl = uploaded.url;
  }

  const person = await deps.createPerson({
    data: { ...deps.data, foto_perfil_url: fotoPerfilUrl },
  });

  if (deps.data.program_ids.length > 0 && person?.id) {
    await deps.enrollPerson({
      personId: person.id,
      programIds: deps.data.program_ids,
    });
  }

  const consentRows = buildConsentRows({
    purposes: GROUP_A,
    consentChoices: deps.consentChoices,
    consentTemplatesEs: deps.consentTemplatesEs,
    consentTemplatesLang: deps.consentTemplatesLang,
    personLanguage: deps.data.idioma_principal,
    consentDocUrl: null,
    numeroSerie: deps.numeroSerie,
    grantedAt: GRANTED_AT,
  });
  await deps.saveConsents({ personId: person.id, consents: consentRows });
}

// ─── Tests ─────────────────────────────────────────────────────────────────

function makeBaseDeps(): SubmitDeps {
  return {
    isSubmitting: false,
    groupAAccepted: true,
    data: {
      canal_llegada: "boca_a_boca",
      nombre: "Juan",
      apellidos: "García López",
      fecha_nacimiento: "1990-01-01",
      idioma_principal: "es",
      program_ids: ["pid-1"],
    },
    profilePhotoBase64: null,
    consentChoices: {
      tratamiento_datos_bocatas: true,
      fotografia: true,
      comunicaciones_whatsapp: true,
    },
    consentTemplatesEs: GROUP_A.map((purpose) =>
      template(
        purpose as ConsentTemplate["purpose"],
        "es",
        `Texto español vigente para ${purpose}`
      )
    ),
    consentTemplatesLang: [],
    numeroSerie: "BCT-2026-00142",
    uploadPhoto: vi.fn().mockResolvedValue({ url: "https://cdn/x.jpg" }),
    createPerson: vi
      .fn()
      .mockResolvedValue({ id: "person-id-123", nombre: "Juan", apellidos: "García López" }),
    enrollPerson: vi.fn().mockResolvedValue([]),
    saveConsents: vi.fn().mockResolvedValue([]),
    toastError: vi.fn(),
  };
}

describe("RegistrationWizard — submit flow", () => {
  it("blocks createPerson when Group A consents are not accepted", async () => {
    const deps = makeBaseDeps();
    deps.groupAAccepted = false;

    await runHandleFinalSubmit(deps);

    expect(deps.createPerson).not.toHaveBeenCalled();
    expect(deps.toastError).toHaveBeenCalledTimes(1);
  });

  it("calls createPerson once with the expected payload (no profile photo)", async () => {
    const deps = makeBaseDeps();

    await runHandleFinalSubmit(deps);

    expect(deps.createPerson).toHaveBeenCalledTimes(1);
    expect(deps.createPerson).toHaveBeenCalledWith({
      data: {
        canal_llegada: "boca_a_boca",
        nombre: "Juan",
        apellidos: "García López",
        fecha_nacimiento: "1990-01-01",
        idioma_principal: "es",
        program_ids: ["pid-1"],
        foto_perfil_url: null,
      },
    });
  });

  it("uploads profile photo first and threads its url into createPerson payload", async () => {
    const deps = makeBaseDeps();
    deps.profilePhotoBase64 = "base64-bytes";

    await runHandleFinalSubmit(deps);

    expect(deps.uploadPhoto).toHaveBeenCalledWith({
      bucket: "fotos-perfil",
      base64: "base64-bytes",
    });
    expect(deps.createPerson).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ foto_perfil_url: "https://cdn/x.jpg" }),
      })
    );
  });

  it("enrolls the new person in selected programs and saves Group A consents", async () => {
    const deps = makeBaseDeps();

    await runHandleFinalSubmit(deps);

    expect(deps.enrollPerson).toHaveBeenCalledWith({
      personId: "person-id-123",
      programIds: ["pid-1"],
    });
    expect(deps.saveConsents).toHaveBeenCalledTimes(1);
    const [arg] = deps.saveConsents.mock.calls[0] ?? [];
    expect(arg.personId).toBe("person-id-123");
    expect(arg.consents).toHaveLength(3);
    expect(arg.consents.every((c: { granted: boolean }) => c.granted === true)).toBe(true);
  });

  it("saves translated consent template rows when the selected language has templates", async () => {
    const deps = makeBaseDeps();
    deps.data.idioma_principal = "fr";
    deps.consentTemplatesLang = GROUP_A.map((purpose) =>
      template(
        purpose as ConsentTemplate["purpose"],
        "fr",
        `Texte français actif pour ${purpose}`
      )
    );

    await runHandleFinalSubmit(deps);

    const [arg] = deps.saveConsents.mock.calls[0] ?? [];
    expect(arg.consents).toHaveLength(3);
    expect(arg.consents.every((c: { idioma: string }) => c.idioma === "fr")).toBe(true);
    expect(arg.consents[0]).toMatchObject({
      consent_text: "Texte français actif pour tratamiento_datos_bocatas",
      consent_version: "1.0-fr",
      numero_serie: "BCT-2026-00142",
    });
  });

  it("falls back to Spanish consent rows for languages without active templates", async () => {
    const deps = makeBaseDeps();
    deps.data.idioma_principal = "wo";
    deps.consentTemplatesLang = deps.consentTemplatesEs;

    await runHandleFinalSubmit(deps);

    const [arg] = deps.saveConsents.mock.calls[0] ?? [];
    expect(arg.consents).toHaveLength(3);
    expect(arg.consents.every((c: { idioma: string }) => c.idioma === "es")).toBe(true);
    expect(arg.consents[0]).toMatchObject({
      consent_text: "Texto español vigente para tratamiento_datos_bocatas",
      consent_version: "1.0-es",
    });
  });

  it("returns early when isSubmitting is true (re-entry guard)", async () => {
    const deps = makeBaseDeps();
    deps.isSubmitting = true;

    await runHandleFinalSubmit(deps);

    expect(deps.createPerson).not.toHaveBeenCalled();
    expect(deps.uploadPhoto).not.toHaveBeenCalled();
  });
});
