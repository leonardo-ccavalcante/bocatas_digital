/**
 * persons.enroll.test.ts — el alta usa OTRO escritor de inscripciones.
 *
 * `persons.enroll` es el camino del wizard; `programs.enrollPerson` el del modal
 * de la pantalla de programas. El segundo recibió la guarda de `inscribible` y
 * el revive de bajas; el primero se quedó con un `upsert` a pelo. Consecuencias
 * medidas contra la base:
 *
 *   · inscribía en un CONTENEDOR (`formacion`, inscribible=false), contra
 *     ADR-0013;
 *   · y al revivir una baja dejaba `motivo_baja`, `fecha_fin` y `deleted_at`
 *     intactos, sin escribir en `enrollment_events`.
 *
 * Un solo escritor: `createOrReviveEnrollment`.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const reviveMock = vi.hoisted(() => vi.fn());
const programsById = vi.hoisted(() => new Map<string, { inscribible: boolean; name: string }>());

vi.mock("../programs.enrollmentEstado", () => ({
  createOrReviveEnrollment: reviveMock,
}));

vi.mock("../../../client/src/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: () => {
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "order"]) b[m] = vi.fn(() => b);
      b.in = vi.fn((_col: string, ids: string[]) => {
        const rows = ids
          .map((id) => {
            const p = programsById.get(id);
            return p ? { id, name: p.name, inscribible: p.inscribible, estados_habilitados: ["activo"] } : null;
          })
          .filter(Boolean);
        return Promise.resolve({ data: rows, error: null });
      });
      return b;
    },
  }),
  createServerClient: vi.fn(),
}));

import { enrollRouter } from "../persons/enroll";
import type { TrpcContext } from "../../_core/context";
import { Logger } from "../../_core/logger";

function ctx(): TrpcContext {
  return {
    user: {
      id: "u1", openId: "u1", email: "v@bocatas.org", name: "v",
      loginMethod: "manus", role: "voluntario",
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    } as TrpcContext["user"],
    logger: new Logger(),
    correlationId: "enroll-test",
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const PERSON = "11111111-1111-4111-8111-111111111111";
const COMEDOR = "22222222-2222-4222-8222-222222222222";
const FORMACION = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  vi.clearAllMocks();
  programsById.clear();
  programsById.set(COMEDOR, { inscribible: true, name: "Comedor Social" });
  programsById.set(FORMACION, { inscribible: false, name: "Formación" });
  reviveMock.mockResolvedValue({ id: "enr-1", program_id: COMEDOR, estado: "activo" });
});

describe("persons.enroll", () => {
  it("inscribe usando el escritor común, no un upsert propio", async () => {
    await enrollRouter.createCaller(ctx()).enroll({ personId: PERSON, programIds: [COMEDOR] });

    expect(reviveMock).toHaveBeenCalledTimes(1);
    expect(reviveMock.mock.calls[0][2]).toMatchObject({ personId: PERSON, programId: COMEDOR });
  });

  it("no inscribe en un contenedor", async () => {
    await expect(
      enrollRouter.createCaller(ctx()).enroll({ personId: PERSON, programIds: [FORMACION] })
    ).rejects.toThrow(/no admite inscripciones/i);
    expect(reviveMock).not.toHaveBeenCalled();
  });

  it("una inscripción ya viva no rompe el alta entera", async () => {
    const { TRPCError } = await import("@trpc/server");
    reviveMock.mockRejectedValueOnce(new TRPCError({ code: "CONFLICT", message: "ya" }));

    await expect(
      enrollRouter.createCaller(ctx()).enroll({ personId: PERSON, programIds: [COMEDOR] })
    ).resolves.toEqual([]);
  });

  it("sin programas no consulta nada", async () => {
    await expect(
      enrollRouter.createCaller(ctx()).enroll({ personId: PERSON, programIds: [] })
    ).resolves.toEqual([]);
    expect(reviveMock).not.toHaveBeenCalled();
  });
});
