import { z } from "zod";

export const PROGRAMS = ["comedor", "familia", "formacion", "atencion_juridica", "voluntariado", "acompanamiento"] as const;
export const ROLES = ["superadmin", "admin", "voluntario", "beneficiario"] as const;

export const FormSchema = z.object({
  titulo: z.string().min(1, "Título requerido").max(200),
  contenido: z.string().min(1, "Contenido requerido").max(5000),
  tipo: z.enum(["info", "evento", "cierre_servicio", "convocatoria"]),
  es_urgente: z.boolean().default(false),
  fijado: z.boolean().default(false),
  fecha_fin: z.string().optional(),
  published_at: z.string().date().optional(),
  expires_at: z.string().date().optional(),
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
