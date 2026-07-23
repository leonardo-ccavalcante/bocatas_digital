import { describe, it, expect } from "vitest";
import {
  SESSION_ESTADOS,
  SESSION_ESTADO_LABELS,
  SessionEstadoSchema,
  TimeStringSchema,
  ProgramacionSlotSchema,
  ProgramacionSchema,
  DIA_SEMANA_LABELS,
  CLOSE_FIELD_TIPOS,
  CloseFieldSchema,
  SessionCloseConfigSchema,
  CLOSE_CONFIG_PRESETS,
  SessionDataSchema,
  ProgramSessionSchema,
  SessionDocumentSchema,
  SessionDocumentInsertSchema,
} from "../sessionSchemas";

describe("SESSION_ESTADOS", () => {
  it("has exactly 4 states in the expected order", () => {
    expect(SESSION_ESTADOS).toEqual(["planificada", "abierta", "cerrada", "cancelada"]);
  });

  it("has labels for all states", () => {
    for (const estado of SESSION_ESTADOS) {
      expect(SESSION_ESTADO_LABELS[estado]).toBeDefined();
      expect(typeof SESSION_ESTADO_LABELS[estado]).toBe("string");
    }
  });
});

describe("SessionEstadoSchema", () => {
  it("accepts valid states", () => {
    expect(SessionEstadoSchema.parse("planificada")).toBe("planificada");
    expect(SessionEstadoSchema.parse("abierta")).toBe("abierta");
    expect(SessionEstadoSchema.parse("cerrada")).toBe("cerrada");
    expect(SessionEstadoSchema.parse("cancelada")).toBe("cancelada");
  });

  it("rejects invalid states", () => {
    expect(() => SessionEstadoSchema.parse("invalid")).toThrow();
    expect(() => SessionEstadoSchema.parse("")).toThrow();
    expect(() => SessionEstadoSchema.parse(null)).toThrow();
  });
});

describe("TimeStringSchema", () => {
  it("accepts valid HH:MM times", () => {
    expect(TimeStringSchema.parse("00:00")).toBe("00:00");
    expect(TimeStringSchema.parse("09:30")).toBe("09:30");
    expect(TimeStringSchema.parse("12:00")).toBe("12:00");
    expect(TimeStringSchema.parse("23:59")).toBe("23:59");
  });

  it("rejects invalid time formats", () => {
    expect(() => TimeStringSchema.parse("25:00")).toThrow();
    expect(() => TimeStringSchema.parse("12:60")).toThrow();
    expect(() => TimeStringSchema.parse("9:30")).toThrow(); // missing leading zero
    expect(() => TimeStringSchema.parse("12:5")).toThrow(); // missing trailing zero
    expect(() => TimeStringSchema.parse("12-30")).toThrow();
    expect(() => TimeStringSchema.parse("")).toThrow();
  });
});

describe("ProgramacionSlotSchema", () => {
  it("accepts valid slots", () => {
    const slot = { dia_semana: 1, hora_inicio: "09:00", hora_fin: "11:00" };
    expect(ProgramacionSlotSchema.parse(slot)).toEqual(slot);
  });

  it("rejects invalid dia_semana", () => {
    expect(() =>
      ProgramacionSlotSchema.parse({ dia_semana: -1, hora_inicio: "09:00", hora_fin: "11:00" })
    ).toThrow();
    expect(() =>
      ProgramacionSlotSchema.parse({ dia_semana: 7, hora_inicio: "09:00", hora_fin: "11:00" })
    ).toThrow();
  });

  it("requires hora_fin > hora_inicio", () => {
    expect(() =>
      ProgramacionSlotSchema.parse({ dia_semana: 1, hora_inicio: "11:00", hora_fin: "09:00" })
    ).toThrow();
    expect(() =>
      ProgramacionSlotSchema.parse({ dia_semana: 1, hora_inicio: "10:00", hora_fin: "10:00" })
    ).toThrow();
  });
});

describe("ProgramacionSchema", () => {
  it("accepts array of valid slots", () => {
    const prog = [
      { dia_semana: 1, hora_inicio: "09:00", hora_fin: "11:00" },
      { dia_semana: 3, hora_inicio: "14:00", hora_fin: "16:00" },
    ];
    expect(ProgramacionSchema.parse(prog)).toEqual(prog);
  });

  it("accepts empty array", () => {
    expect(ProgramacionSchema.parse([])).toEqual([]);
  });
});

describe("DIA_SEMANA_LABELS", () => {
  it("has 7 days starting with Domingo", () => {
    expect(DIA_SEMANA_LABELS).toHaveLength(7);
    expect(DIA_SEMANA_LABELS[0]).toBe("Domingo");
    expect(DIA_SEMANA_LABELS[6]).toBe("Sábado");
  });
});

describe("CloseFieldSchema", () => {
  it("accepts valid field definitions", () => {
    const field = { slug: "raciones", label: "Raciones servidas", tipo: "numero", obligatorio: true };
    expect(CloseFieldSchema.parse(field)).toEqual(field);
  });

  it("validates all field types", () => {
    for (const tipo of CLOSE_FIELD_TIPOS) {
      const field = { slug: "test", label: "Test", tipo, obligatorio: false };
      expect(CloseFieldSchema.parse(field).tipo).toBe(tipo);
    }
  });

  it("rejects invalid tipo", () => {
    expect(() =>
      CloseFieldSchema.parse({ slug: "test", label: "Test", tipo: "invalid", obligatorio: true })
    ).toThrow();
  });

  it("rejects empty slug or label", () => {
    expect(() =>
      CloseFieldSchema.parse({ slug: "", label: "Test", tipo: "numero", obligatorio: true })
    ).toThrow();
    expect(() =>
      CloseFieldSchema.parse({ slug: "test", label: "", tipo: "numero", obligatorio: true })
    ).toThrow();
  });
});

describe("SessionCloseConfigSchema", () => {
  it("accepts valid config", () => {
    const config = {
      enabled: true,
      fields: [{ slug: "raciones", label: "Raciones", tipo: "numero", obligatorio: true }],
      uploads: [{ slug: "plan_clase", label: "Plan de la clase", obligatorio: true }],
      tema_obligatorio: true,
    };
    expect(SessionCloseConfigSchema.parse(config)).toEqual(config);
  });

  it("rejects a bare-string upload (uploads carry label + obligatorio)", () => {
    const config = { enabled: true, fields: [], uploads: ["plan_clase"], tema_obligatorio: false };
    expect(SessionCloseConfigSchema.safeParse(config).success).toBe(false);
  });

  it("defaults tema_obligatorio to false", () => {
    const config = { enabled: false, fields: [], uploads: [] };
    expect(SessionCloseConfigSchema.parse(config).tema_obligatorio).toBe(false);
  });

  it("accepts empty arrays", () => {
    const config = { enabled: false, fields: [], uploads: [] };
    expect(SessionCloseConfigSchema.parse(config)).toBeDefined();
  });
});

describe("CLOSE_CONFIG_PRESETS", () => {
  it("has presets for all program types", () => {
    const expectedTypes = ["edicion", "actividad", "continuo", "curso", "contenedor", "basico"];
    for (const tipo of expectedTypes) {
      expect(CLOSE_CONFIG_PRESETS[tipo]).toBeDefined();
    }
  });

  it("each preset validates against SessionCloseConfigSchema", () => {
    for (const [tipo, preset] of Object.entries(CLOSE_CONFIG_PRESETS)) {
      const result = SessionCloseConfigSchema.safeParse(preset);
      expect(result.success, `Preset ${tipo} failed validation: ${JSON.stringify(result)}`).toBe(
        true
      );
    }
  });

  it("edicion preset requires tema and a mandatory plan_clase upload", () => {
    const preset = CLOSE_CONFIG_PRESETS.edicion;
    expect(preset.enabled).toBe(true);
    expect(preset.tema_obligatorio).toBe(true);
    const planClase = preset.uploads.find((u) => u.slug === "plan_clase");
    expect(planClase).toBeDefined();
    expect(planClase?.obligatorio).toBe(true);
  });

  it("actividad preset has conteo and incidencias fields", () => {
    const preset = CLOSE_CONFIG_PRESETS.actividad;
    expect(preset.enabled).toBe(true);
    const slugs = preset.fields.map((f) => f.slug);
    expect(slugs).toContain("asistentes");
    expect(slugs).toContain("incidencias");
  });

  it("continuo preset has raciones field", () => {
    const preset = CLOSE_CONFIG_PRESETS.continuo;
    expect(preset.enabled).toBe(true);
    expect(preset.fields.some((f) => f.slug === "raciones")).toBe(true);
  });

  it("contenedor and curso have disabled close configs", () => {
    expect(CLOSE_CONFIG_PRESETS.contenedor.enabled).toBe(false);
    expect(CLOSE_CONFIG_PRESETS.curso.enabled).toBe(false);
  });
});

describe("SessionDataSchema", () => {
  it("accepts valid session data", () => {
    const data = {
      raciones: 150,
      tema: "Introducción al español",
      voluntarios: ["Juan", "María"],
      incidencias: null,
    };
    expect(SessionDataSchema.parse(data)).toEqual(data);
  });

  it("accepts empty object", () => {
    expect(SessionDataSchema.parse({})).toEqual({});
  });
});

describe("ProgramSessionSchema", () => {
  it("accepts a valid session object", () => {
    const session = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      program_id: "123e4567-e89b-12d3-a456-426614174001",
      fecha: "2026-07-23",
      location_id: null,
      estado: "abierta",
      hora_inicio: "09:00",
      hora_fin: "11:00",
      responsable_nombre: "Ana García",
      responsable_person_id: null,
      motivo_cancelacion: null,
      en_nombre_de: null,
      enlace_token_hash: null,
      enlace_expira: null,
      opened_by: "123e4567-e89b-12d3-a456-426614174002",
      closed_by: null,
      closed_at: null,
      session_data: { raciones: 150 },
      created_at: "2026-07-23T09:00:00Z",
    };
    expect(ProgramSessionSchema.parse(session)).toEqual(session);
  });

  it("rejects invalid fecha format", () => {
    const session = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      program_id: "123e4567-e89b-12d3-a456-426614174001",
      fecha: "23-07-2026", // wrong format
      location_id: null,
      estado: "abierta",
      hora_inicio: null,
      hora_fin: null,
      responsable_nombre: null,
      responsable_person_id: null,
      motivo_cancelacion: null,
      en_nombre_de: null,
      enlace_token_hash: null,
      enlace_expira: null,
      opened_by: null,
      closed_by: null,
      closed_at: null,
      session_data: null,
      created_at: "2026-07-23T09:00:00Z",
    };
    expect(() => ProgramSessionSchema.parse(session)).toThrow();
  });
});

describe("SessionDocumentSchema", () => {
  it("accepts valid document", () => {
    const doc = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      session_id: "123e4567-e89b-12d3-a456-426614174001",
      tipo_slug: "plan_clase",
      url: "program-documents/sessions/abc/plan.pdf",
      version: 1,
      subido_por: "Ana García",
      en_nombre_de: null,
      created_at: "2026-07-23T10:00:00Z",
    };
    expect(SessionDocumentSchema.parse(doc)).toEqual(doc);
  });
});

describe("SessionDocumentInsertSchema", () => {
  it("accepts insert without id and created_at", () => {
    const doc = {
      session_id: "123e4567-e89b-12d3-a456-426614174001",
      tipo_slug: "plan_clase",
      url: "program-documents/sessions/abc/plan.pdf",
      subido_por: "Ana García",
      en_nombre_de: null,
    };
    const parsed = SessionDocumentInsertSchema.parse(doc);
    expect(parsed.version).toBe(1); // default
    expect(parsed.session_id).toBe(doc.session_id);
  });

  it("allows explicit version", () => {
    const doc = {
      session_id: "123e4567-e89b-12d3-a456-426614174001",
      tipo_slug: "plan_clase",
      url: "program-documents/sessions/abc/plan.pdf",
      version: 2,
      subido_por: "Ana García",
      en_nombre_de: null,
    };
    expect(SessionDocumentInsertSchema.parse(doc).version).toBe(2);
  });
});
