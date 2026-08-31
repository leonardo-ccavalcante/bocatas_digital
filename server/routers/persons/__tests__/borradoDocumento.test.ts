/**
 * Borrado de la imagen del documento — las dos puertas de salida.
 *
 * Conservar la foto de un DNI se sostiene en el consentimiento
 * `archivo_documento_identidad`. Un consentimiento que no se puede retirar DE
 * VERDAD no es consentimiento: si revocarlo no borra la imagen, la casilla es
 * decorativa y el derecho de supresión, teórico.
 *
 * Es la parte del cambio que toca datos IRREVERSIBLES: no hay copia de la
 * imagen. De ahí que se pruebe el orden (objeto primero, columna después) y el
 * fallo del Storage, no sólo el camino feliz.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TrpcContext } from "../../../_core/context";
import { Logger } from "../../../_core/logger";

const { fromMock, removeMock, auditMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  removeMock: vi.fn(),
  auditMock: vi.fn(),
}));

vi.mock("../../../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({ from: fromMock })),
  createServerClient: vi.fn(),
}));

vi.mock("../../../storage", () => ({
  AVATAR_BUCKET: "fotos-perfil",
  ID_DOCUMENT_BUCKET: "documentos-identidad",
  storageRemove: removeMock,
  storageSignedUrl: vi.fn(),
  storageSignedUrls: vi.fn(),
  signPathField: vi.fn(),
}));

vi.mock("../../../_core/logging-middleware", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../_core/logging-middleware")>();
  return { ...real, logAudit: auditMock };
});

vi.mock("../../../db/soft-delete-cascade", () => ({
  softDeleteWithCascade: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../_core/pii-crypto", () => ({
  encryptPII: vi.fn((v: string | null) => v),
  decryptPII: vi.fn((v: string | null) => v),
  isPiiCryptoConfigured: vi.fn(() => true),
}));

import { router } from "../../../_core/trpc";
import { softDeletePerson } from "../update";

const testRouter = router({ softDelete: softDeletePerson });
const PERSON_ID = "11111111-1111-4111-8111-111111111111";

function ctx(role: string): TrpcContext {
  return {
    user: {
      id: "u1", openId: `t-${role}`, email: `${role}@b.org`, name: role,
      loginMethod: "manus", role, createdAt: new Date(), updatedAt: new Date(),
      lastSignedIn: new Date(),
    } as NonNullable<TrpcContext["user"]>,
    logger: new Logger(),
    correlationId: "borrado-test",
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

/** persons.select().eq().is().maybeSingle() */
function personaChain(fila: unknown) {
  const c: Record<string, ReturnType<typeof vi.fn>> = {
    select: vi.fn(), eq: vi.fn(), is: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: fila, error: null }),
  };
  c.select.mockReturnValue(c); c.eq.mockReturnValue(c); c.is.mockReturnValue(c);
  return c;
}

/** attendances count → sin check-ins */
function conteoChain(count: number) {
  const resultado = { count, error: null };
  const c: Record<string, unknown> = {
    select: vi.fn(), eq: vi.fn(), is: vi.fn(),
    then: (r: (v: unknown) => unknown) => Promise.resolve(resultado).then(r),
  };
  for (const k of ["select", "eq", "is"]) (c[k] as ReturnType<typeof vi.fn>).mockReturnValue(c);
  return c;
}

beforeEach(() => {
  fromMock.mockReset();
  removeMock.mockReset().mockResolvedValue(true);
  auditMock.mockReset();
});

describe("softDelete — retirar la ficha borra las fotos", () => {
  it("borra perfil y documento de sus buckets", async () => {
    // softDeleteWithCascade sólo marca filas: sin esto, una ficha retirada
    // dejaba la imagen de su DNI en el bucket indefinidamente.
    fromMock
      .mockReturnValueOnce(personaChain({
        id: PERSON_ID, nombre: "Ana", apellidos: "G",
        foto_perfil_url: "perfil.jpg", foto_documento_url: "dni.jpg",
      }))
      .mockReturnValueOnce(conteoChain(0));

    await testRouter.createCaller(ctx("superadmin")).softDelete({ id: PERSON_ID });

    expect(removeMock).toHaveBeenCalledWith("fotos-perfil", "perfil.jpg");
    expect(removeMock).toHaveBeenCalledWith("documentos-identidad", "dni.jpg");
  });

  it("sin fotos, no llama al Storage", async () => {
    fromMock
      .mockReturnValueOnce(personaChain({
        id: PERSON_ID, nombre: "Ana", apellidos: "G",
        foto_perfil_url: null, foto_documento_url: null,
      }))
      .mockReturnValueOnce(conteoChain(0));

    await testRouter.createCaller(ctx("superadmin")).softDelete({ id: PERSON_ID });
    expect(removeMock).not.toHaveBeenCalled();
  });

  it("con check-ins se rechaza ANTES de borrar nada", async () => {
    // La ficha con historial no se retira: se fusiona. Y sobre todo, no se
    // toca ninguna imagen por el camino.
    fromMock
      .mockReturnValueOnce(personaChain({
        id: PERSON_ID, nombre: "Ana", apellidos: "G",
        foto_perfil_url: "perfil.jpg", foto_documento_url: "dni.jpg",
      }))
      .mockReturnValueOnce(conteoChain(3));

    await expect(
      testRouter.createCaller(ctx("superadmin")).softDelete({ id: PERSON_ID })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    expect(removeMock).not.toHaveBeenCalled();
  });

  it("un admin no puede, y no se borra nada", async () => {
    await expect(
      testRouter.createCaller(ctx("admin")).softDelete({ id: PERSON_ID })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fromMock).not.toHaveBeenCalled();
    expect(removeMock).not.toHaveBeenCalled();
  });
});

// ── Revocar el consentimiento borra la imagen ────────────────────────────────
import { consentsRouter } from "../consents";

const consentRouter = router({ saveConsents: consentsRouter.saveConsents });

/**
 * Cadena permisiva de supabase-js: cualquier método encadenable devuelve la
 * propia cadena, y esperarla resuelve a `{data}`. Enumerar los métodos a mano
 * ataba la prueba a la forma EXACTA de la consulta (assertGroupACovered usa
 * `.in`, por ejemplo) y la rompía por un motivo que no es el que se prueba.
 */
function previosChain(filas: unknown[]) {
  const resultado = { data: filas, error: null };
  const c: Record<string, unknown> = {
    then: (r: (v: unknown) => unknown) => Promise.resolve(resultado).then(r),
  };
  for (const k of ["select", "eq", "is", "in", "not", "order", "limit"]) {
    c[k] = vi.fn(() => c);
  }
  return c;
}

/** consents.upsert().select() */
function upsertChain(capturado: { filas?: unknown[] }) {
  const c: Record<string, ReturnType<typeof vi.fn>> = {
    upsert: vi.fn((filas: unknown[]) => { capturado.filas = filas; return c; }),
    select: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  return c;
}

/** persons.update().eq() */
function updateChain(capturado: { patch?: unknown }) {
  const c: Record<string, ReturnType<typeof vi.fn>> = {
    update: vi.fn((p: unknown) => { capturado.patch = p; return c; }),
    eq: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  return c;
}

/** Los tres fines de los que SIEMPRE tiene que constar decisión (consents.ts). */
const YA_EN_BASE = [
  { purpose: "tratamiento_datos_bocatas", granted: true },
  { purpose: "fotografia", granted: false },
  { purpose: "comunicaciones_whatsapp", granted: false },
];

const FIN = "archivo_documento_identidad";
type FinConsent = Parameters<
  ReturnType<typeof consentRouter.createCaller>["saveConsents"]
>[0]["consents"][number];

const filaConsent = (purpose: FinConsent["purpose"], granted: boolean): FinConsent => ({
  purpose, idioma: "es", granted,
  granted_at: "2026-01-01T00:00:00Z",
  consent_text: "t", consent_version: "1.0",
});

describe("saveConsents — retirar el archivo BORRA la imagen", () => {
  it("de otorgado a denegado: borra el objeto y limpia la columna", async () => {
    const up = { filas: undefined as unknown[] | undefined };
    const patch = { patch: undefined as unknown };
    fromMock
      .mockReturnValueOnce(previosChain(YA_EN_BASE))            // assertGroupACovered
      .mockReturnValueOnce(previosChain([                       // decisiones previas
        { purpose: FIN, granted: true, revoked_at: null },
        { purpose: "tratamiento_datos_bocatas", granted: true, revoked_at: null },
      ]))
      .mockReturnValueOnce(personaChain({ foto_documento_url: "dni.jpg" }))
      .mockReturnValueOnce(updateChain(patch))
      .mockReturnValueOnce(upsertChain(up));

    await consentRouter.createCaller(ctx("voluntario")).saveConsents({
      personId: PERSON_ID,
      consents: [filaConsent(FIN, false), filaConsent("tratamiento_datos_bocatas", true)],
    });

    expect(removeMock).toHaveBeenCalledWith("documentos-identidad", "dni.jpg");
    // Objeto PRIMERO, columna DESPUÉS: una columna que apunta a un archivo
    // inexistente es peor que un reintento.
    expect(patch.patch).toEqual({ foto_documento_url: null });
  });

  it("si el Storage falla, la columna NO se limpia (se puede reintentar)", async () => {
    removeMock.mockResolvedValue(false);
    const patch = { patch: undefined as unknown };
    fromMock
      .mockReturnValueOnce(previosChain(YA_EN_BASE))
      .mockReturnValueOnce(previosChain([{ purpose: FIN, granted: true, revoked_at: null }]))
      .mockReturnValueOnce(personaChain({ foto_documento_url: "dni.jpg" }))
      .mockReturnValueOnce(upsertChain({}));

    await consentRouter.createCaller(ctx("voluntario")).saveConsents({
      personId: PERSON_ID,
      consents: [filaConsent(FIN, false)],
    });

    expect(patch.patch).toBeUndefined();
  });

  it("un «no» que ya era «no» no borra nada ni sella revoked_at", async () => {
    const up = { filas: undefined as unknown[] | undefined };
    fromMock
      .mockReturnValueOnce(previosChain(YA_EN_BASE))
      .mockReturnValueOnce(previosChain([{ purpose: FIN, granted: false, revoked_at: null }]))
      .mockReturnValueOnce(upsertChain(up));

    await consentRouter.createCaller(ctx("voluntario")).saveConsents({
      personId: PERSON_ID,
      consents: [filaConsent(FIN, false)],
    });

    expect(removeMock).not.toHaveBeenCalled();
    expect((up.filas as Array<{ revoked_at: string | null }>)[0].revoked_at).toBeNull();
  });

  it("revoked_at se sella al pasar de otorgado a denegado (nadie lo escribía)", async () => {
    const up = { filas: undefined as unknown[] | undefined };
    fromMock
      .mockReturnValueOnce(previosChain(YA_EN_BASE))
      .mockReturnValueOnce(previosChain([{ purpose: "fotografia", granted: true, revoked_at: null }]))
      .mockReturnValueOnce(upsertChain(up));

    await consentRouter.createCaller(ctx("voluntario")).saveConsents({
      personId: PERSON_ID,
      consents: [filaConsent("fotografia", false)],
    });

    expect((up.filas as Array<{ revoked_at: string | null }>)[0].revoked_at).not.toBeNull();
  });
});
