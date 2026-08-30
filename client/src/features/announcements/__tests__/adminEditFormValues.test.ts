/**
 * adminEditFormValues.test.ts — FAMILIAS-9 (segunda mitad)
 *
 * Al pulsar el lápiz en /admin/novedades, `openEdit` hacía
 * `form.reset({ titulo, contenido, tipo, es_urgente, fijado, fecha_fin })`
 * SIN `audiences`. Consecuencias encadenadas:
 *
 *  1. `FormSchema.audiences` es `z.array(...).min(1)` (obligatorio), así que
 *     zodResolver rechazaba el submit y "Guardar cambios" no hacía nada:
 *     editar cualquier novedad era imposible.
 *  2. `AudiencesSelector` recibe `form.watch("audiences") || DEFAULT_AUDIENCE`
 *     y nunca escribe de vuelta, así que la ficha MENTÍA: mostraba "no hay nada
 *     seleccionado ⇒ la ven todos" incluso en una novedad segmentada.
 *  3. En cuanto la usuaria tocaba una casilla para desbloquear el submit, el
 *     valor enviado se construía desde cero y borraba la audiencia real.
 *
 * `editFormValuesFromRow` reconstruye los valores del formulario desde la fila
 * que `announcements.getAll` ya devuelve (incluye `announcement_audiences`).
 */
import { describe, it, expect } from "vitest";
import {
  FormSchema,
  editFormValuesFromRow,
  toAnnouncementPayload,
  DEFAULT_AUDIENCE,
} from "@/pages/AdminNovedades/_shared";

function row(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "9f1c2d34-5678-4abc-9def-0123456789ab",
    titulo: "Cierre del comedor",
    contenido: "El comedor no abrirá el lunes.",
    tipo: "cierre_servicio",
    es_urgente: false,
    fijado: false,
    fecha_fin: null,
    published_at: null,
    expires_at: null,
    imagen_url: null,
    announcement_audiences: [],
    ...extra,
  };
}

describe("editFormValuesFromRow — la edición conserva la audiencia (FAMILIAS-9)", () => {
  it("[documenta el fallo] los valores que enviaba openEdit sin `audiences` no pasan FormSchema, por eso 'Guardar cambios' no hacía nada", () => {
    const sinAudiencias = {
      titulo: "Cierre del comedor",
      contenido: "El comedor no abrirá el lunes.",
      tipo: "cierre_servicio",
      es_urgente: false,
      fijado: false,
    };
    expect(FormSchema.safeParse(sinAudiencias).success).toBe(false);
  });

  it("conserva la segmentación por programa de la novedad que se está editando", () => {
    const values = editFormValuesFromRow(
      row({
        announcement_audiences: [
          { id: "a1", roles: [], programs: ["comedor"] },
        ],
      })
    );
    expect(values.audiences).toEqual([{ roles: [], programs: ["comedor"] }]);
    expect(FormSchema.safeParse(values).success).toBe(true);
  });

  it("conserva varias reglas y su segmentación por rol", () => {
    const values = editFormValuesFromRow(
      row({
        announcement_audiences: [
          { id: "a1", roles: ["voluntario"], programs: ["familia"] },
          { id: "a2", roles: ["admin"], programs: [] },
        ],
      })
    );
    expect(values.audiences).toEqual([
      { roles: ["voluntario"], programs: ["familia"] },
      { roles: ["admin"], programs: [] },
    ]);
    expect(FormSchema.safeParse(values).success).toBe(true);
  });

  it("cae en 'visible para todos' sólo cuando la novedad no trae ninguna regla", () => {
    expect(editFormValuesFromRow(row()).audiences).toEqual(DEFAULT_AUDIENCE);
  });

  it("descarta valores de programa/rol que ya no existen en el catálogo cerrado en vez de romper el formulario", () => {
    const values = editFormValuesFromRow(
      row({
        announcement_audiences: [
          { id: "a1", roles: ["fantasma"], programs: ["comedor", "programa_inexistente"] },
        ],
      })
    );
    expect(values.audiences).toEqual([{ roles: [], programs: ["comedor"] }]);
    expect(FormSchema.safeParse(values).success).toBe(true);
  });

  it("recupera fechas e imagen para que editar el título no las borre", () => {
    const values = editFormValuesFromRow(
      row({
        fecha_fin: "2026-09-15T00:00:00.000Z",
        published_at: "2026-09-01",
        expires_at: "2026-09-30",
        imagen_url: "https://example.org/cartel.png",
      })
    );
    expect(values.fecha_fin).toBe("2026-09-15");
    expect(values.published_at).toBe("2026-09-01");
    expect(values.expires_at).toBe("2026-09-30");
    expect(values.image_url).toBe("https://example.org/cartel.png");
    expect(FormSchema.safeParse(values).success).toBe(true);
  });
});

/**
 * El formulario guarda la imagen en `image_url`, pero
 * CreateAnnouncementSchema / UpdateAnnouncementSchema
 * (server/routers/announcements/_shared.ts) declaran `imagen_url`. Zod descarta
 * las claves que no conoce, así que la imagen se subía al bucket público y
 * jamás quedaba enlazada a la novedad: se veía en el formulario y desaparecía
 * al guardar.
 */
describe("toAnnouncementPayload — la imagen llega al servidor (FAMILIAS-9)", () => {
  const base = {
    titulo: "Con cartel",
    contenido: "Texto",
    tipo: "info" as const,
    es_urgente: false,
    fijado: false,
    audiences: DEFAULT_AUDIENCE,
  };

  it("renombra image_url a imagen_url, que es la clave que acepta el router", () => {
    const payload = toAnnouncementPayload({
      ...base,
      image_url: "https://example.org/cartel.png",
    });
    expect(payload).toMatchObject({ imagen_url: "https://example.org/cartel.png" });
    expect(payload).not.toHaveProperty("image_url");
  });

  it("envía null cuando se quita la imagen, para que el servidor la borre", () => {
    const payload = toAnnouncementPayload({ ...base, image_url: null });
    expect(payload.imagen_url).toBeNull();
  });

  it("omite imagen_url cuando la novedad nunca tuvo imagen, para no pisar la existente al editar", () => {
    const payload = toAnnouncementPayload(base);
    expect(payload.imagen_url).toBeUndefined();
  });

  it("sigue convirtiendo fecha_fin a ISO completo", () => {
    const payload = toAnnouncementPayload({ ...base, fecha_fin: "2026-09-15" });
    expect(payload.fecha_fin).toBe("2026-09-15T00:00:00.000Z");
  });
});
