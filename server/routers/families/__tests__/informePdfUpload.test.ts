/**
 * FAMILIAS-4b — «la subida ha de ser en pdf».
 *
 * Hasta ahora el informe social se podía subir como JPG/PNG (el input aceptaba
 * `application/pdf, image/*` y el servidor no miraba el archivo en absoluto: solo
 * recibe la RUTA de storage). Un informe firmado guardado como foto no sirve como
 * documento legal.
 *
 * Dos barreras, porque la extensión se falsifica renombrando:
 *   1. `uploadFamilyDocument` rechaza una ruta que no acabe en .pdf (barata).
 *   2. `verifyUploadedPdf` descarga el objeto ya subido con el cliente
 *      service-role y comprueba la CABECERA REAL (%PDF-); si no lo es, borra el
 *      objeto y la fila para no dejar PII huérfana ni un informe inválido.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import type { TrpcContext } from "../../../_core/context";
import { Logger } from "../../../_core/logger";

// ─── Mocks (deben preceder a los imports del módulo bajo prueba) ─────────────

type Result = { data?: unknown; error?: unknown };

const { fromMock, storageFromMock, rpcMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  storageFromMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock("../../../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({
    from: fromMock,
    rpc: rpcMock,
    storage: { from: storageFromMock },
  })),
  createServerClient: vi.fn(),
}));

vi.mock("../../../db", () => ({ getDb: vi.fn(async () => null) }));

import { documentsRouter } from "../documents";
import {
  acceptParaTipo,
  ayudaFormatoParaTipo,
  esPdfPorContenido,
  esRutaPdf,
  soloAdmitePdf,
} from "@shared/documentFormat";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Cadena encadenable estilo PostgREST: cualquier filtro devuelve `this`. */
function tableMock(result: Result) {
  const obj = {
    select: vi.fn(() => obj),
    update: vi.fn(() => obj),
    insert: vi.fn(() => obj),
    eq: vi.fn(() => obj),
    in: vi.fn(() => obj),
    is: vi.fn(() => obj),
    not: vi.fn(() => obj),
    limit: vi.fn(() => obj),
    order: vi.fn(() => obj),
    single: vi.fn(() => Promise.resolve(result)),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (res: (v: Result) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(res, rej),
  };
  return obj;
}

function adminCtx(): TrpcContext {
  return {
    user: {
      id: "user-1",
      openId: "user-1",
      email: "admin@bocatas.org",
      name: "admin",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    logger: new Logger(),
    correlationId: "informe-pdf-test",
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const FAMILY_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const DOC_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

beforeEach(() => {
  fromMock.mockReset();
  storageFromMock.mockReset();
  rpcMock.mockReset();
});

// ─── 1. Barrera de extensión en la subida ────────────────────────────────────

describe("uploadFamilyDocument — el informe social solo admite PDF", () => {
  it("rechaza una ruta .jpg para informe_social sin tocar la base de datos", async () => {
    const caller = documentsRouter.createCaller(adminCtx());

    await expect(
      caller.uploadFamilyDocument({
        family_id: FAMILY_ID,
        member_index: -1,
        documento_tipo: "informe_social",
        documento_url: `${FAMILY_ID}/-1/informe_social/1700000000000.jpg`,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rechaza un .png aunque el nombre suene a informe", async () => {
    const caller = documentsRouter.createCaller(adminCtx());
    await expect(
      caller.uploadFamilyDocument({
        family_id: FAMILY_ID,
        member_index: -1,
        documento_tipo: "informe_social",
        documento_url: `${FAMILY_ID}/-1/informe_social/foto.png`,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("acepta una ruta .pdf para informe_social", async () => {
    rpcMock.mockResolvedValue({ data: { id: DOC_ID }, error: null });
    fromMock.mockImplementation(() => tableMock({ data: [{ id: DOC_ID }], error: null }));

    const caller = documentsRouter.createCaller(adminCtx());
    const out = await caller.uploadFamilyDocument({
      family_id: FAMILY_ID,
      member_index: -1,
      documento_tipo: "informe_social",
      documento_url: `${FAMILY_ID}/-1/informe_social/1700000000000.pdf`,
    });

    expect(out).toEqual({ id: DOC_ID });
    expect(rpcMock).toHaveBeenCalledOnce();
  });

  it("no restringe los tipos que sí admiten foto (documento de identidad)", async () => {
    rpcMock.mockResolvedValue({ data: { id: DOC_ID }, error: null });
    fromMock.mockImplementation(() => tableMock({ data: [{ id: DOC_ID }], error: null }));

    const caller = documentsRouter.createCaller(adminCtx());
    await expect(
      caller.uploadFamilyDocument({
        family_id: FAMILY_ID,
        member_index: 0,
        documento_tipo: "documento_identidad",
        documento_url: `${FAMILY_ID}/0/documento_identidad/1700000000000.jpg`,
      }),
    ).resolves.toBeTruthy();
  });
});

// ─── 2. Verificación real del contenido ──────────────────────────────────────

describe("verifyUploadedPdf — comprueba la cabecera real, no la extensión", () => {
  const PATH = `${FAMILY_ID}/-1/informe_social/1700000000000.pdf`;

  function setupRow(bytes: Uint8Array<ArrayBuffer>) {
    const removeMock = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const table = tableMock({
      data: {
        id: DOC_ID,
        family_id: FAMILY_ID,
        documento_tipo: "informe_social",
        documento_url: PATH,
      },
      error: null,
    });
    fromMock.mockImplementation(() => table);
    storageFromMock.mockReturnValue({
      download: vi.fn(() => Promise.resolve({ data: new Blob([bytes]), error: null })),
      remove: removeMock,
    });
    return { removeMock, table };
  }

  it("acepta un PDF real (%PDF-)", async () => {
    const { removeMock } = setupRow(new TextEncoder().encode("%PDF-1.7\n..."));

    const caller = documentsRouter.createCaller(adminCtx());
    await expect(caller.verifyUploadedPdf({ id: DOC_ID })).resolves.toEqual({ ok: true });
    expect(removeMock).not.toHaveBeenCalled();
  });

  it("rechaza un JPEG renombrado a .pdf y borra objeto + fila", async () => {
    // Cabecera JPEG (FF D8 FF) dentro de un archivo llamado .pdf.
    const { removeMock, table } = setupRow(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]));

    const caller = documentsRouter.createCaller(adminCtx());
    await expect(caller.verifyUploadedPdf({ id: DOC_ID })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });

    expect(removeMock).toHaveBeenCalledWith([PATH]);
    expect(table.update).toHaveBeenCalledWith(
      expect.objectContaining({ is_current: false, deleted_at: expect.any(String) }),
    );
  });

  it("un .docx renombrado (cabecera PK) también se rechaza", async () => {
    const { removeMock } = setupRow(new Uint8Array([0x50, 0x4b, 0x03, 0x04]));

    const caller = documentsRouter.createCaller(adminCtx());
    await expect(caller.verifyUploadedPdf({ id: DOC_ID })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(removeMock).toHaveBeenCalled();
  });
});

// --- 2b. La superficie tRPC no cambia al partir el router -------------------

describe("documentsRouter - superficie tras extraer documents-informe", () => {
  it("sigue exponiendo los procedimientos del informe y los de documentos", () => {
    const caller = documentsRouter.createCaller(adminCtx());
    expect(typeof caller.getSocialReportPdf).toBe("function");
    expect(typeof caller.verifyUploadedPdf).toBe("function");
    expect(typeof caller.uploadFamilyDocument).toBe("function");
    expect(typeof caller.deleteFamilyDocument).toBe("function");
    expect(typeof caller.getFamilyDocuments).toBe("function");
  });
});

// --- 3. Reglas de formato compartidas (cliente + servidor) ------------------

describe("shared/documentFormat - una sola fuente de verdad", () => {
  it("el informe social solo admite PDF; el resto sigue admitiendo foto", () => {
    expect(soloAdmitePdf("informe_social")).toBe(true);
    expect(soloAdmitePdf("documento_identidad")).toBe(false);
    expect(soloAdmitePdf("padron_municipal")).toBe(false);
  });

  it("el accept del input refleja la misma regla", () => {
    expect(acceptParaTipo("informe_social")).toBe("application/pdf,.pdf");
    expect(acceptParaTipo("documento_identidad")).toContain("image/*");
  });

  it("el texto de ayuda no promete formatos que se van a rechazar", () => {
    expect(ayudaFormatoParaTipo("informe_social")).toMatch(/solo pdf/i);
    expect(ayudaFormatoParaTipo("padron_municipal")).toMatch(/jpg/i);
  });

  it("esRutaPdf ignora mayusculas y espacios, y no se deja enganar por .pdf.jpg", () => {
    expect(esRutaPdf("fam/informe.pdf")).toBe(true);
    expect(esRutaPdf("fam/informe.PDF")).toBe(true);
    expect(esRutaPdf("  fam/informe.pdf  ")).toBe(true);
    expect(esRutaPdf("fam/informe.pdf.jpg")).toBe(false);
    expect(esRutaPdf("fam/informe")).toBe(false);
  });

  it("esPdfPorContenido exige la firma %PDF- completa", () => {
    expect(esPdfPorContenido(new TextEncoder().encode("%PDF-1.4"))).toBe(true);
    expect(esPdfPorContenido(new TextEncoder().encode("%PDF"))).toBe(false);
    expect(esPdfPorContenido(new TextEncoder().encode("PK"))).toBe(false);
    expect(esPdfPorContenido(new Uint8Array([]))).toBe(false);
  });
});
