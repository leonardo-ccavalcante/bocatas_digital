/**
 * persons.getDocumentUrls / getPersonIdsWithDocuments
 *
 * Lo que se prueba: la política de acceso, la deduplicación de la hoja de
 * consentimiento, y que la auditoría diga la verdad sin llevar PII.
 *
 * El caso del fan-out es el más valioso: el alta escribe el MISMO
 * `consentDocUrl` en TODAS las filas de consents de esa persona, así que una
 * sola hoja firmada produce hasta cinco registros. Sin dedup el visor enseña la
 * misma foto cinco veces y la línea de auditoría cuenta cinco documentos donde
 * hay uno.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TrpcContext } from "../../../_core/context";
import { Logger } from "../../../_core/logger";

// vi.hoisted: los factories de vi.mock se izan por encima de las constantes, y
// logging-middleware lo carga trpc.ts antes que nada.
const { fromMock, auditMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  auditMock: vi.fn(),
}));

vi.mock("../../../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({ from: fromMock })),
  createServerClient: vi.fn(),
}));

vi.mock("../../../storage", () => ({
  ID_DOCUMENT_BUCKET: "documentos-identidad",
  CONSENT_DOCUMENT_BUCKET: "documentos-consentimiento",
  storageSignedUrl: vi.fn(async (_b: string, p: string) => `https://firmada/${p}`),
  storageSignedUrls: vi.fn(
    async (_b: string, paths: string[]) =>
      new Map(paths.map((p) => [p, `https://firmada/${p}`]))
  ),
}));

vi.mock("../../../_core/logging-middleware", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../_core/logging-middleware")>();
  return { ...real, logAudit: auditMock };
});

import { router } from "../../../_core/trpc";
import { getDocumentUrls, getPersonIdsWithDocuments } from "../documents";
import { storageSignedUrl } from "../../../storage";

const testRouter = router({ getDocumentUrls, getPersonIdsWithDocuments });

const PERSON_ID = "11111111-1111-1111-1111-111111111111";

function ctx(role: string): TrpcContext {
  return {
    user: {
      id: "u1", openId: `test-${role}`, email: `${role}@bocatas.org`, name: role,
      loginMethod: "manus", role, createdAt: new Date(), updatedAt: new Date(),
      lastSignedIn: new Date(),
    } as NonNullable<TrpcContext["user"]>,
    logger: new Logger(),
    correlationId: "documents-test",
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

/** persons.select(...).eq().is().maybeSingle() */
function personaChain(fila: unknown, error: unknown = null) {
  const c: Record<string, ReturnType<typeof vi.fn>> = {
    select: vi.fn(), eq: vi.fn(), is: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: fila, error }),
  };
  c.select.mockReturnValue(c); c.eq.mockReturnValue(c); c.is.mockReturnValue(c);
  return c;
}

/** consents.select(...).eq().is().not() → thenable */
function consentsChain(filas: unknown[], error: unknown = null) {
  const resultado = { data: filas, error };
  const c: Record<string, unknown> = {
    select: vi.fn(), eq: vi.fn(), is: vi.fn(), not: vi.fn(),
    then: (r: (v: unknown) => unknown) => Promise.resolve(resultado).then(r),
  };
  for (const k of ["select", "eq", "is", "not"]) {
    (c[k] as ReturnType<typeof vi.fn>).mockReturnValue(c);
  }
  return c;
}

/** persons/consents.select().is().not() → thenable, para el índice de ids */
function idsChain(filas: unknown[]) {
  const resultado = { data: filas, error: null };
  const c: Record<string, unknown> = {
    select: vi.fn(), is: vi.fn(), not: vi.fn(),
    then: (r: (v: unknown) => unknown) => Promise.resolve(resultado).then(r),
  };
  for (const k of ["select", "is", "not"]) {
    (c[k] as ReturnType<typeof vi.fn>).mockReturnValue(c);
  }
  return c;
}

beforeEach(() => {
  fromMock.mockReset();
  auditMock.mockReset();
  vi.mocked(storageSignedUrl).mockImplementation(async (_b, p) => `https://firmada/${p}`);
});

describe("getDocumentUrls — política de acceso", () => {
  it.each(["admin", "voluntario"])("rechaza a %s SIN tocar la base", async (rol) => {
    const caller = testRouter.createCaller(ctx(rol));
    await expect(caller.getDocumentUrls({ personId: PERSON_ID })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe("getDocumentUrls — contenido", () => {
  it("devuelve el documento de identidad firmado", async () => {
    fromMock
      .mockReturnValueOnce(personaChain({ id: PERSON_ID, foto_documento_url: "dni.jpg", updated_at: "2026-01-01" }))
      .mockReturnValueOnce(consentsChain([]));

    const r = await testRouter.createCaller(ctx("superadmin")).getDocumentUrls({ personId: PERSON_ID });

    expect(r.documentos).toEqual([
      { kind: "identidad", purposes: [], url: "https://firmada/dni.jpg", archivadoEn: "2026-01-01" },
    ]);
  });

  it("cinco filas de consentimiento con UNA ruta son UN documento", async () => {
    fromMock
      .mockReturnValueOnce(personaChain({ id: PERSON_ID, foto_documento_url: null, updated_at: null }))
      .mockReturnValueOnce(
        consentsChain(
          ["tratamiento_datos_bocatas", "fotografia", "comunicaciones_whatsapp",
           "compartir_datos_red", "tratamiento_datos_banco_alimentos"].map((purpose, i) => ({
            purpose,
            documento_foto_url: "hoja.jpg",
            granted_at: `2026-01-0${i + 1}`,
          }))
        )
      );

    const r = await testRouter.createCaller(ctx("superadmin")).getDocumentUrls({ personId: PERSON_ID });

    expect(r.documentos).toHaveLength(1);
    expect(r.documentos[0].purposes).toHaveLength(5);
    // Se conserva la fecha más temprana: es cuando se firmó la hoja.
    expect(r.documentos[0].archivadoEn).toBe("2026-01-01");
  });

  it("si firmar falla, la entrada SIGUE ahí con url null", async () => {
    // "Consta pero no abre" y "nunca se archivó" son cosas distintas:
    // descartarla haría concluir que la foto nunca se tomó.
    vi.mocked(storageSignedUrl).mockResolvedValueOnce(null);
    fromMock
      .mockReturnValueOnce(personaChain({ id: PERSON_ID, foto_documento_url: "dni.jpg", updated_at: null }))
      .mockReturnValueOnce(consentsChain([]));

    const r = await testRouter.createCaller(ctx("superadmin")).getDocumentUrls({ personId: PERSON_ID });

    expect(r.documentos).toHaveLength(1);
    expect(r.documentos[0].url).toBeNull();
  });

  it("una persona sin nada devuelve una lista vacía, no un error", async () => {
    fromMock
      .mockReturnValueOnce(personaChain({ id: PERSON_ID, foto_documento_url: null, updated_at: null }))
      .mockReturnValueOnce(consentsChain([]));

    const r = await testRouter.createCaller(ctx("superadmin")).getDocumentUrls({ personId: PERSON_ID });
    expect(r.documentos).toEqual([]);
  });

  it("persona inexistente → NOT_FOUND", async () => {
    fromMock.mockReturnValueOnce(personaChain(null));
    await expect(
      testRouter.createCaller(ctx("superadmin")).getDocumentUrls({ personId: PERSON_ID })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("un error de base no filtra el mensaje del driver", async () => {
    fromMock.mockReturnValueOnce(personaChain(null, { message: "column persons.secreto does not exist" }));
    await expect(
      testRouter.createCaller(ctx("superadmin")).getDocumentUrls({ personId: PERSON_ID })
    ).rejects.toMatchObject({ message: "No se pudieron obtener los documentos. Inténtalo de nuevo." });
  });
});

describe("getDocumentUrls — auditoría", () => {
  it("registra UNA línea por consulta, sin ruta, URL ni nombre", async () => {
    fromMock
      .mockReturnValueOnce(personaChain({ id: PERSON_ID, foto_documento_url: "dni.jpg", updated_at: null }))
      .mockReturnValueOnce(consentsChain([{ purpose: "fotografia", documento_foto_url: "hoja.jpg", granted_at: null }]));

    await testRouter.createCaller(ctx("superadmin")).getDocumentUrls({ personId: PERSON_ID });

    expect(auditMock).toHaveBeenCalledTimes(1);
    const [, accion, meta] = auditMock.mock.calls[0];
    expect(accion).toBe("persons.getDocumentUrls");
    expect(meta).toEqual({ personId: PERSON_ID, identidad: true, consentimientos: 1, firmadas: 2 });
    // Ni rutas ni URLs. Ojo: `firmadas` es una CLAVE legítima (un contador),
    // así que el patrón busca las formas que sí filtrarían.
    const serializado = JSON.stringify(meta);
    expect(serializado).not.toMatch(/\.jpg|https?:\/\//);
  });

  it("registra también cuando NO hay nada que enseñar", async () => {
    // El caso vacío es justo la señal de enumeración que interesa tener.
    fromMock
      .mockReturnValueOnce(personaChain({ id: PERSON_ID, foto_documento_url: null, updated_at: null }))
      .mockReturnValueOnce(consentsChain([]));

    await testRouter.createCaller(ctx("superadmin")).getDocumentUrls({ personId: PERSON_ID });

    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(auditMock.mock.calls[0][2]).toMatchObject({ identidad: false, consentimientos: 0 });
  });
});

describe("getPersonIdsWithDocuments", () => {
  it("es sólo de superadmin", async () => {
    await expect(
      testRouter.createCaller(ctx("admin")).getPersonIdsWithDocuments()
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("une las dos fuentes sin repetir, y no devuelve ninguna ruta", async () => {
    const OTRA = "22222222-2222-2222-2222-222222222222";
    fromMock
      .mockReturnValueOnce(idsChain([{ id: PERSON_ID }]))
      .mockReturnValueOnce(idsChain([{ person_id: PERSON_ID }, { person_id: OTRA }]));

    const r = await testRouter.createCaller(ctx("superadmin")).getPersonIdsWithDocuments();

    expect(r.personIds.sort()).toEqual([PERSON_ID, OTRA].sort());
    expect(JSON.stringify(r)).not.toMatch(/jpg|https/);
  });
});
