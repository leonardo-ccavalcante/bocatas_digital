import { z } from "zod";

export const PROGRAMS = ["comedor", "familia", "formacion", "atencion_juridica", "voluntariado", "acompanamiento"] as const;
export const ROLES = ["superadmin", "admin", "voluntario", "beneficiario"] as const;

// react-hook-form submits "" for untouched <input type="date"> fields; treat
// "" as "not provided" so the optional dates validate (QA F001/F106/F228).
const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

export const TIPOS = ["info", "evento", "cierre_servicio", "convocatoria"] as const;

export const FormSchema = z.object({
  titulo: z.string().min(1, "Título requerido").max(200),
  contenido: z.string().min(1, "Contenido requerido").max(5000),
  tipo: z.enum(TIPOS),
  es_urgente: z.boolean().default(false),
  fijado: z.boolean().default(false),
  fecha_fin: z.preprocess(emptyToUndefined, z.string().date("Formato: AAAA-MM-DD").optional()),
  published_at: z.preprocess(emptyToUndefined, z.string().date("Formato: AAAA-MM-DD").optional()),
  expires_at: z.preprocess(emptyToUndefined, z.string().date("Formato: AAAA-MM-DD").optional()),
  image_url: z.string().url().optional().nullable(),
  audiences: z.array(
    z.object({
      programs: z.array(z.enum(PROGRAMS)),
      roles: z.array(z.enum(ROLES)),
    })
  ).min(1, "Al menos una regla de audiencia es requerida"),
}).refine(
  (data) => {
    // If both dates are provided, expires_at must be after published_at
    if (data.published_at && data.expires_at) {
      return new Date(data.expires_at) > new Date(data.published_at);
    }
    // If only one or neither is provided, it's valid
    return true;
  },
  {
    message: "La fecha de expiración debe ser posterior a la fecha de publicación",
    path: ["expires_at"],
  }
);

export type FormValues = z.infer<typeof FormSchema>;

/**
 * Serialises parsed form values into the payload announcements.create/update
 * expect: the server wants fecha_fin as a full ISO datetime, while the date
 * input emits YYYY-MM-DD (or undefined after the ""-preprocess above).
 *
 * `image_url` se renombra a `imagen_url` porque es la clave que declaran
 * CreateAnnouncementSchema / UpdateAnnouncementSchema. Zod descarta en silencio
 * las claves desconocidas, así que mientras se enviaba `image_url` la imagen
 * llegaba al bucket público pero nunca quedaba enlazada a la novedad.
 * Se omite cuando no hay valor: al editar, `undefined` conserva la imagen
 * existente y `null` la borra.
 */
export function toAnnouncementPayload(values: FormValues) {
  const { image_url, ...rest } = values;
  return {
    ...rest,
    fecha_fin: values.fecha_fin ? `${values.fecha_fin}T00:00:00.000Z` : undefined,
    imagen_url: image_url,
  };
}

/** Filtra los valores que siguen existiendo en el catálogo cerrado del formulario. */
function pickKnown<T extends string>(raw: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (v): v is T => typeof v === "string" && (allowed as readonly string[]).includes(v)
  );
}

/** `<input type="date">` sólo acepta AAAA-MM-DD; la fila puede traer un ISO completo. */
function toDateInput(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.length >= 10 ? raw.slice(0, 10) : undefined;
}

/**
 * Reconstruye los valores del formulario a partir de la fila que devuelve
 * `announcements.getAll` (que ya incluye `announcement_audiences`).
 *
 * Sin esto, `form.reset()` dejaba `audiences` en undefined: FormSchema lo exige
 * (`.min(1)`), así que zodResolver bloqueaba el submit y "Guardar cambios" no
 * hacía nada, mientras el selector mostraba "todos" sobre una novedad que en
 * realidad estaba segmentada.
 */
export function editFormValuesFromRow(row: Record<string, unknown>): FormValues {
  const rawAudiences = Array.isArray(row.announcement_audiences)
    ? (row.announcement_audiences as unknown[])
    : [];
  const audiences = rawAudiences.map((rule) => {
    const r = rule as { roles?: unknown; programs?: unknown };
    return { roles: pickKnown(r.roles, ROLES), programs: pickKnown(r.programs, PROGRAMS) };
  });
  const tipo = typeof row.tipo === "string" ? row.tipo : "";

  return {
    titulo: typeof row.titulo === "string" ? row.titulo : "",
    contenido: typeof row.contenido === "string" ? row.contenido : "",
    tipo: (TIPOS as readonly string[]).includes(tipo)
      ? (tipo as (typeof TIPOS)[number])
      : "info",
    es_urgente: row.es_urgente === true,
    fijado: row.fijado === true,
    fecha_fin: toDateInput(row.fecha_fin),
    published_at: toDateInput(row.published_at),
    expires_at: toDateInput(row.expires_at),
    image_url: typeof row.imagen_url === "string" ? row.imagen_url : null,
    audiences: audiences.length > 0 ? audiences : DEFAULT_AUDIENCE,
  };
}

export const TIPO_LABELS: Record<string, string> = {
  info: "Información",
  evento: "Evento",
  cierre_servicio: "Cierre de servicio",
  convocatoria: "Convocatoria",
};

export const TIPO_COLORS: Record<string, string> = {
  info: "bg-blue-50 text-blue-700",
  evento: "bg-green-50 text-green-700",
  cierre_servicio: "bg-orange-50 text-orange-700",
  convocatoria: "bg-purple-50 text-purple-700",
};

// Default audience: visible to everyone (no role/program filter).
export const DEFAULT_AUDIENCE: Array<{ programs: (typeof PROGRAMS)[number][]; roles: (typeof ROLES)[number][] }> = [
  { roles: [] as (typeof ROLES)[number][], programs: [] as (typeof PROGRAMS)[number][] },
];
