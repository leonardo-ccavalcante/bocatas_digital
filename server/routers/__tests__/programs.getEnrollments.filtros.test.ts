/**
 * programs.getEnrollments — filtros de la cabecera de la tabla de inscritos.
 *
 * El fake aplica DE VERDAD los `eq`/`is` que recibe (incluidas las rutas con
 * punto del embed `persons!inner`), así que cada caso comprueba que el filtro
 * RECORTA el conjunto, no sólo que la llamada se hizo.
 *
 * El fixture reproduce el curso real 2026_09_coc (Cocina): sus estados
 * habilitados NO incluyen 'activo'. Con el defecto viejo la pantalla decía
 * «0 personas inscritas (activos)» en un curso de 23. Ese caso está abajo.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TrpcContext } from "../../_core/context";
import { Logger } from "../../_core/logger";
import type { User } from "../../../drizzle/schema";

const PROGRAM_ID = "22222222-2222-4222-8222-222222222222";

type Persona = {
  id: string;
  nombre: string;
  apellidos: string;
  foto_perfil_url: string | null;
  restricciones_alimentarias: string | null;
  deleted_at: string | null;
  pais_origen: string | null;
  genero: string | null;
  situacion_laboral: string | null;
  situacion_ante_empleo: string | null;
};

type Fila = {
  id: string;
  program_id: string;
  estado: string;
  deleted_at: string | null;
  persons: Persona;
};

function persona(p: Partial<Persona> & { id: string; nombre: string; apellidos: string }): Persona {
  return {
    foto_perfil_url: null,
    restricciones_alimentarias: null,
    deleted_at: null,
    pais_origen: null,
    genero: null,
    situacion_laboral: null,
    situacion_ante_empleo: null,
    ...p,
  };
}

const FILAS: Fila[] = [
  {
    id: "e1", program_id: PROGRAM_ID, estado: "inscrito", deleted_at: null,
    persons: persona({
      id: "p1", nombre: "Fatou", apellidos: "Diop",
      pais_origen: "SN", genero: "femenino",
      situacion_laboral: "desempleado", situacion_ante_empleo: "inactiva",
    }),
  },
  {
    id: "e2", program_id: PROGRAM_ID, estado: "admitido", deleted_at: null,
    persons: persona({
      id: "p2", nombre: "Youssef", apellidos: "El Amrani",
      pais_origen: "MA", genero: "masculino",
      situacion_laboral: "economia_informal", situacion_ante_empleo: "precariedad_laboral",
    }),
  },
  {
    id: "e3", program_id: PROGRAM_ID, estado: "lista_espera", deleted_at: null,
    persons: persona({
      id: "p3", nombre: "Aicha", apellidos: "Benali",
      pais_origen: "MA", genero: "femenino",
      situacion_laboral: "desempleado", situacion_ante_empleo: "inactiva",
    }),
  },
  {
    id: "e4", program_id: PROGRAM_ID, estado: "terminado", deleted_at: null,
    persons: persona({
      id: "p4", nombre: "Juan", apellidos: "Pérez",
      pais_origen: "ES", genero: "masculino",
      situacion_laboral: "empleo_temporal", situacion_ante_empleo: "no_aplica",
    }),
  },
];

let igualdades: Array<[string, unknown]> = [];
let ors: Array<[string, unknown]> = [];

/** `persons.pais_origen` → fila.persons.pais_origen; `estado` → fila.estado. */
function leer(fila: Fila, columna: string): unknown {
  const [primero, segundo] = columna.split(".");
  if (segundo === undefined) return (fila as unknown as Record<string, unknown>)[primero];
  return (fila.persons as unknown as Record<string, unknown>)[segundo];
}

/** Mini-PostgREST: `nombre.ilike."%ben%",apellidos.ilike."%ben%"`. */
function coincide(fila: Fila, filtro: string): boolean {
  const m = /ilike\."%(.*?)%"/.exec(filtro);
  if (!m) return true;
  const aguja = m[1].toLowerCase();
  return `${fila.persons.nombre} ${fila.persons.apellidos}`.toLowerCase().includes(aguja);
}

function crearCadena(): Record<string, unknown> {
  const cadena: Record<string, unknown> = {};
  for (const m of ["select", "order", "range", "in"]) cadena[m] = vi.fn(() => cadena);
  cadena.eq = vi.fn((columna: string, valor: unknown) => {
    igualdades.push([columna, valor]);
    return cadena;
  });
  cadena.is = vi.fn((columna: string, valor: unknown) => {
    igualdades.push([columna, valor]);
    return cadena;
  });
  cadena.or = vi.fn((filtro: string, opciones?: unknown) => {
    ors.push([filtro, opciones]);
    return cadena;
  });
  cadena.then = (resolve: (v: unknown) => unknown) => {
    const data = FILAS.filter(
      (f) =>
        igualdades.every(([columna, valor]) => leer(f, columna) === valor) &&
        ors.every(([filtro]) => coincide(f, filtro as string))
    );
    return Promise.resolve({ data, error: null, count: data.length }).then(resolve);
  };
  return cadena;
}

vi.mock("../../../client/src/lib/supabase/server", () => ({
  createAdminClient: () => ({ from: () => crearCadena() }),
  createServerClient: vi.fn(),
}));

vi.mock("../../storage", () => ({
  AVATAR_BUCKET: "fotos-perfil",
  ID_DOCUMENT_BUCKET: "documentos-identidad",
  CONSENT_DOCUMENT_BUCKET: "documentos-consentimiento",
  signPathField: vi.fn(),
  storagePut: vi.fn(),
  storageSignedUrl: vi.fn(),
  storageSignedUrls: vi.fn(),
  storageRemove: vi.fn(),
  fetchStorageBuffer: vi.fn(),
}));

function buildContext(): TrpcContext {
  const user: User = {
    id: "test-user-42",
    openId: "manus-admin-openid",
    email: "admin@example.com",
    name: "Admin Fixture",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    logger: new Logger(),
    correlationId: "test-getEnrollments-filtros",
  };
}

async function listar(
  filtros: {
    estado?: "activo" | "inscrito";
    search?: string;
    pais_origen?: string;
    genero?: "femenino" | "masculino";
    situacion_laboral?: "desempleado" | "empleo_temporal";
    situacion_ante_empleo?: "inactiva";
  } = {}
) {
  const { programsRouter } = await import("../programs");
  return programsRouter
    .createCaller(buildContext())
    .getEnrollments({ programId: PROGRAM_ID, ...filtros });
}

beforeEach(() => {
  igualdades = [];
  ors = [];
});

describe("programs.getEnrollments — sin filtros y el defecto viejo", () => {
  it("sin filtros devuelve el curso entero", async () => {
    const r = await listar();
    expect(r.total).toBe(4);
    expect(r.enrollments).toHaveLength(4);
  });

  it("el defecto viejo ('activo') vaciaba un curso que no habilita ese estado", async () => {
    const r = await listar({ estado: "activo" });
    expect(r.total).toBe(0);
  });
});

describe("programs.getEnrollments — un eje recorta el conjunto", () => {
  it("pais_origen", async () => {
    const r = await listar({ pais_origen: "MA" });
    expect(r.enrollments.map((e) => e.id)).toEqual(["e2", "e3"]);
    expect(r.total).toBe(2);
  });

  it("genero", async () => {
    const r = await listar({ genero: "femenino" });
    expect(r.enrollments.map((e) => e.id)).toEqual(["e1", "e3"]);
  });

  it("situacion_laboral", async () => {
    const r = await listar({ situacion_laboral: "desempleado" });
    expect(r.enrollments.map((e) => e.id)).toEqual(["e1", "e3"]);
  });

  it("situacion_ante_empleo", async () => {
    const r = await listar({ situacion_ante_empleo: "inactiva" });
    expect(r.enrollments.map((e) => e.id)).toEqual(["e1", "e3"]);
  });

  it("filtra por la columna del embed, no por una del enrollment", async () => {
    await listar({ pais_origen: "MA" });
    expect(igualdades).toContainEqual(["persons.pais_origen", "MA"]);
  });
});

describe("programs.getEnrollments — filtros combinados", () => {
  it("país + género dejan sólo a quien cumple los dos", async () => {
    const r = await listar({ pais_origen: "MA", genero: "femenino" });
    expect(r.enrollments.map((e) => e.id)).toEqual(["e3"]);
    expect(r.total).toBe(1);
  });

  it("país + estado se combinan con el filtro de estado existente", async () => {
    const r = await listar({ pais_origen: "MA", estado: "inscrito" });
    expect(r.total).toBe(0);
  });
});

describe("programs.getEnrollments — la búsqueda por fin filtra", () => {
  it("recorta por apellido", async () => {
    const r = await listar({ search: "benali" });
    expect(r.enrollments.map((e) => e.id)).toEqual(["e3"]);
  });

  it("va acotada al embed con referencedTable (un .or con punto es un PGRST100)", async () => {
    await listar({ search: "ben" });
    expect(ors).toHaveLength(1);
    expect(ors[0][0]).toBe('nombre.ilike."%ben%",apellidos.ilike."%ben%"');
    expect(ors[0][1]).toEqual({ referencedTable: "persons" });
  });

  it("sin search no toca .or()", async () => {
    await listar();
    expect(ors).toHaveLength(0);
  });
});
