/**
 * informePdfUpload.test.ts — el informe social sólo entra en PDF (FAMILIAS-4b).
 *
 * La comprobación vive DENTRO de `uploadFamilyDocument`, que desde RC-03 recibe
 * los bytes y escribe en Storage con el cliente service-role. Mirar la cabecera
 * ahí es gratis y nada llega al bucket si no cuadra; comprobarlo después de
 * subir obliga a borrar objeto y fila, y deja una ventana en la que el fichero
 * equivocado ya está guardado.
 *
 * Se mira el CONTENIDO, no la extensión: `informe.pdf` se renombra en un
 * segundo.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const storagePutMock = vi.hoisted(() => vi.fn());
const rpcMock = vi.hoisted(() => vi.fn());

vi.mock("../../../storage", () => ({
  storagePut: storagePutMock,
  storageSignedUrl: vi.fn(),
  signPathField: vi.fn(),
}));

vi.mock("../../../../client/src/lib/supabase/server", () => ({
  createAdminClient: () => ({
    rpc: rpcMock,
    from: () => {
      // Encadenable y thenable: recomputeDocBooleanCache encadena varios
      // filtros y luego hace await sobre el builder.
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "in", "update", "order", "neq", "not", "limit"]) {
        b[m] = vi.fn(() => b);
      }
      b.then = (res: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(res);
      return b;
    },
  }),
  createServerClient: vi.fn(),
}));

import { familiesRouter } from "../index";
import type { TrpcContext } from "../../../_core/context";
import { Logger } from "../../../_core/logger";

function ctx(): TrpcContext {
  return {
    user: {
      id: "u1", openId: "u1", email: "a@bocatas.org", name: "a",
      loginMethod: "manus", role: "admin",
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    } as TrpcContext["user"],
    logger: new Logger(),
    correlationId: "informe-pdf-test",
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const FAMILY = "11111111-1111-4111-8111-111111111111";
const PDF_B64 = Buffer.from("%PDF-1.7\nfake").toString("base64");
const JPG_B64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]).toString("base64");

function subir(tipo: string, base64: string) {
  return familiesRouter.createCaller(ctx()).uploadFamilyDocument({
    family_id: FAMILY,
    member_index: -1,
    documento_tipo: tipo,
    documento_url: `${FAMILY}/doc.pdf`,
    base64,
    content_type: "application/pdf",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  rpcMock.mockResolvedValue({ data: { id: "d1" }, error: null });
});

describe("uploadFamilyDocument — informe social sólo en PDF", () => {
  it("acepta un PDF de verdad", async () => {
    await expect(subir("informe_social", PDF_B64)).resolves.toBeDefined();
    expect(storagePutMock).toHaveBeenCalledTimes(1);
  });

  it("rechaza un JPEG disfrazado y NO lo sube", async () => {
    await expect(subir("informe_social", JPG_B64)).rejects.toThrow(/PDF/i);
    expect(storagePutMock).not.toHaveBeenCalled();
  });

  it("los demás documentos siguen admitiendo foto", async () => {
    await expect(subir("documento_identidad", JPG_B64)).resolves.toBeDefined();
    expect(storagePutMock).toHaveBeenCalledTimes(1);
  });
});
