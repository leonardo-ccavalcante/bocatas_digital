/**
 * programs.session-close-config.test.ts — contract lock for the
 * `session_close_config` JSONB shape on `programs`.
 *
 * SHAPE OWNER (since the "cierre de sesión" feature): the generic config is
 * defined once in `shared/sessionSchemas.ts` (`SessionCloseConfigSchema`). This
 * test locks that shape as the contract for the column so downstream readers
 * (config editor, session-close form, compliance dashboard) share one truth.
 *
 *   SessionCloseConfig {
 *     enabled: boolean;
 *     fields:  Array<{ slug; label; tipo: numero|kg|contagem_personas|texto|lista_voluntarios; obligatorio }>;
 *     uploads: Array<{ slug; label; obligatorio }>;   // slug → program_document_types(scope='sesion')
 *     tema_obligatorio?: boolean;
 *   }
 *
 * HISTORY: an earlier draft (Manus_IM/TASK6_EPIC_E_FAMILIA.md §10) proposed a
 * `{key,label,type,required,ocr_type}` shape for a Familia flow that was never
 * wired to this column (nothing runtime-parsed it; the column stayed opaque
 * `Json`). The Familia/reparto delivery close keeps its OWN hardcoded preset
 * (`FAMILIA_SESSION_CLOSE_PRESET` in the families feature) and does NOT read
 * this column, so the two never collide. OCR uploads are deferred (v1 uses QR
 * scan for attendance); if a funder later needs digitized signed paper, an
 * upload slug + an OCR pass can be added without changing this shape. See
 * ADR-0014.
 *
 * This is a TEST-ONLY contract lock: no migration or column alteration here.
 * The DB default (`{"enabled":false,"uploads":[],"fields":[]}`) parses cleanly.
 */
import { describe, it, expect } from "vitest";
import {
  SessionCloseConfigSchema,
  CLOSE_CONFIG_PRESETS,
} from "../../../shared/sessionSchemas";

describe("session_close_config — generic shape (shared/sessionSchemas)", () => {
  it("parses the DB default ({enabled:false, uploads:[], fields:[]})", () => {
    const parsed = SessionCloseConfigSchema.safeParse({
      enabled: false,
      uploads: [],
      fields: [],
    });
    expect(parsed.success).toBe(true);
  });

  it("parses a course edition config (mandatory tema + plan_clase upload)", () => {
    const parsed = SessionCloseConfigSchema.safeParse({
      enabled: true,
      fields: [{ slug: "incidencias", label: "Incidencias", tipo: "texto", obligatorio: false }],
      uploads: [{ slug: "plan_clase", label: "Plan de la clase", obligatorio: true }],
      tema_obligatorio: true,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown field tipo (must be numero|kg|contagem_personas|texto|lista_voluntarios)", () => {
    const parsed = SessionCloseConfigSchema.safeParse({
      enabled: true,
      fields: [{ slug: "x", label: "X", tipo: "checkbox", obligatorio: false }],
      uploads: [],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a bare-string upload (uploads must carry label + obligatorio)", () => {
    const parsed = SessionCloseConfigSchema.safeParse({
      enabled: true,
      fields: [],
      uploads: ["plan_clase"],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects null (column null is handled by callers before parsing)", () => {
    expect(SessionCloseConfigSchema.safeParse(null).success).toBe(false);
  });

  it("rejects missing 'enabled' boolean", () => {
    const parsed = SessionCloseConfigSchema.safeParse({ uploads: [], fields: [] });
    expect(parsed.success).toBe(false);
  });
});

describe("session_close_config — presets per program type", () => {
  it("every preset validates against the shared schema", () => {
    for (const [tipo, preset] of Object.entries(CLOSE_CONFIG_PRESETS)) {
      const result = SessionCloseConfigSchema.safeParse(preset);
      expect(result.success, `Preset ${tipo} failed: ${JSON.stringify(result)}`).toBe(true);
    }
  });

  it("edicion enables close with a mandatory plan_clase upload and tema", () => {
    const preset = CLOSE_CONFIG_PRESETS.edicion;
    expect(preset.enabled).toBe(true);
    expect(preset.tema_obligatorio).toBe(true);
    const planClase = preset.uploads.find((u) => u.slug === "plan_clase");
    expect(planClase?.obligatorio).toBe(true);
  });

  it("container-like types (curso/contenedor/basico) default to close disabled", () => {
    expect(CLOSE_CONFIG_PRESETS.curso.enabled).toBe(false);
    expect(CLOSE_CONFIG_PRESETS.contenedor.enabled).toBe(false);
    expect(CLOSE_CONFIG_PRESETS.basico.enabled).toBe(false);
  });
});
