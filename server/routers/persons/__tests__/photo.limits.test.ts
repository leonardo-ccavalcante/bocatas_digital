/**
 * photo.limits.test.ts — o guard de tamanho tem de bater certo com o limite
 * REAL de cada bucket em produção.
 *
 * Produção (verificado 2026-08-29 via SQL Editor):
 *   fotos-perfil              -> 5 MiB
 *   documentos-consentimiento -> 10 MiB
 *
 * Um único MAX_BYTES a 8 MiB aceitava uma foto de 6 MiB para `fotos-perfil`,
 * que o storage depois rejeitava — o voluntário tira a foto, o formulário
 * aceita, e a gravação falha a seguir.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { storagePut } = vi.hoisted(() => ({ storagePut: vi.fn() }));
vi.mock("../../../storage", () => ({ storagePut }));

import { photoRouter } from "../photo";
import type { TrpcContext } from "../../../_core/context";
import { Logger } from "../../../_core/logger";

function ctx(): TrpcContext {
  return {
    user: {
      id: "u1", openId: "o1", email: "v@bocatas.org", name: "V",
      loginMethod: "manus", role: "voluntario",
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    logger: new Logger(),
    correlationId: "photo-limits-test",
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const b64 = (bytes: number) => Buffer.alloc(bytes, 1).toString("base64");
const MiB = 1024 * 1024;

beforeEach(() => {
  vi.clearAllMocks();
  storagePut.mockResolvedValue({ bucket: "fotos-perfil", path: "x.jpg" });
});

describe("persons.uploadPhoto — limite por bucket", () => {
  it("aceita 4 MiB em fotos-perfil (abaixo do limite de 5 MiB)", async () => {
    await expect(
      photoRouter.createCaller(ctx()).uploadPhoto({ bucket: "fotos-perfil", base64: b64(4 * MiB) })
    ).resolves.toBeDefined();
  });

  it("REJEITA 6 MiB em fotos-perfil — o bucket só aceita 5 MiB", async () => {
    await expect(
      photoRouter.createCaller(ctx()).uploadPhoto({ bucket: "fotos-perfil", base64: b64(6 * MiB) })
    ).rejects.toThrow();
    expect(storagePut).not.toHaveBeenCalled();
  });

  it("aceita 6 MiB em documentos-consentimiento (limite de 10 MiB)", async () => {
    await expect(
      photoRouter.createCaller(ctx()).uploadPhoto({
        bucket: "documentos-consentimiento", base64: b64(6 * MiB),
      })
    ).resolves.toBeDefined();
  });

  it("rejeita uma foto vazia", async () => {
    await expect(
      photoRouter.createCaller(ctx()).uploadPhoto({ bucket: "fotos-perfil", base64: "" })
    ).rejects.toThrow();
  });
});
