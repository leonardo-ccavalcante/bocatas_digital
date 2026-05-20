import { z } from "zod";

export const ScopeEnum = z.enum(["persona", "familia"]);
export type Scope = z.infer<typeof ScopeEnum>;

export const InstitucionTipoEnum = z.enum([
  "publica",
  "ong",
  "parroquia",
  "privada",
  "otro",
]);
export type InstitucionTipo = z.infer<typeof InstitucionTipoEnum>;

export const InstitucionSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string().min(1).max(200),
  tipo: InstitucionTipoEnum.nullable(),
  areas: z.array(z.string()).default([]),
  direccion: z.string().nullable(),
  codigo_postal: z.string().nullable(),
  distrito: z.string().nullable(),
  telefono: z.string().nullable(),
  // Read shape: a valid email or null. (Plan's chained .nullable() was a typo.)
  email: z.string().email().nullable(),
  notas: z.string().nullable(),
  is_active: z.boolean(),
});
export type Institucion = z.infer<typeof InstitucionSchema>;

export const InstitucionCreateSchema = z.object({
  nombre: z.string().min(1).max(200),
  tipo: InstitucionTipoEnum.optional(),
  areas: z.array(z.string()).default([]),
  direccion: z.string().optional(),
  codigo_postal: z.string().regex(/^\d{5}$/).optional(),
  telefono: z.string().optional(),
  email: z.string().email().optional(),
  notas: z.string().max(1000).optional(),
});
export type InstitucionCreate = z.infer<typeof InstitucionCreateSchema>;

export const InstitucionSnapshotSchema = z.object({
  nombre: z.string(),
  direccion: z.string().nullable(),
  telefono: z.string().nullable(),
  email: z.string().nullable(),
  codigo_postal: z.string().nullable(),
});
export type InstitucionSnapshot = z.infer<typeof InstitucionSnapshotSchema>;

export const HojaSchema = z.object({
  id: z.string().uuid(),
  scope: ScopeEnum,
  persona_id: z.string().uuid().nullable(),
  familia_id: z.string().uuid().nullable(),
  programa_id: z.string().uuid(),
  profesional_id: z.string(),
  profesional_nombre: z.string(),
  fecha_apertura: z.string(), // ISO date
  estado: z.enum(["activa", "cerrada"]),
});
export type Hoja = z.infer<typeof HojaSchema>;

export const InterventionInsertSchema = z.object({
  scope: ScopeEnum,
  entityId: z.string().uuid(), // persona_id or familia_id
  programaId: z.string().uuid(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tipoSlug: z.string().min(1),
  descripcion: z.string().min(1).max(2000),
  institucionId: z.string().uuid().optional(),
  institucionSnapshot: InstitucionSnapshotSchema.optional(),
  observaciones: z.string().max(2000).optional(),
});
export type InterventionInsert = z.infer<typeof InterventionInsertSchema>;

export const StartInterventionInputSchema = z.object({
  scope: ScopeEnum,
  entityId: z.string().uuid(),
  programaId: z.string().uuid(),
});
export type StartInterventionInput = z.infer<typeof StartInterventionInputSchema>;

export const StartInterventionResultSchema = z.object({
  hoja: z.object({
    id: z.string().uuid().nullable(), // null = will be created on first intervention insert
    fechaApertura: z.string(), // ISO; today if hoja doesn't exist yet
    estado: z.enum(["activa", "cerrada", "new"]),
  }),
  // Pre-filled header data — what the form should render as read-only.
  header: z.object({
    nombre: z.string(), // persona full name OR titular full name (if scope=familia)
    numUnidadFamiliar: z.string().nullable(), // family number (number→string) if entity has a family
    programaNombre: z.string(),
    profesionalNombre: z.string(),
    fechaAperturaISO: z.string(),
  }),
  // Defaults for the inputs the user still has to fill.
  defaults: z.object({
    fechaISO: z.string(), // today
    tipoSlug: z.string().nullable(), // null = user must pick
    descripcion: z.string().nullable(), // always null in v1
    observaciones: z.string().nullable(),
  }),
});
export type StartInterventionResult = z.infer<typeof StartInterventionResultSchema>;
