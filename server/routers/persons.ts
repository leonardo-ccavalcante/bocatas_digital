/**
 * persons.ts — tRPC router for person management.
 *
 * All Supabase operations use createAdminClient() (service role key) because
 * the app uses Manus OAuth — users have no Supabase JWT, so RLS policies that
 * check get_user_role() would always return 'beneficiario' (no INSERT rights).
 *
 * Authorization is enforced at the tRPC layer via protectedProcedure: only
 * authenticated Manus users can call these procedures.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createAdminClient } from "../../client/src/lib/supabase/server";
import { protectedProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";

// ─── Input schemas (mirrors PersonCreateSchema from client) ───────────────────
// We re-define here to keep server code independent of client Vite aliases.

const TipoDocumentoEnum = z.enum(["DNI", "NIE", "Pasaporte", "Sin_Documentacion"]);
const GeneroEnum = z.enum(["masculino", "femenino", "no_binario", "prefiere_no_decir"]);
const IdiomaEnum = z.enum(["es", "ar", "fr", "bm", "en", "ro", "zh", "wo", "other"]);
const SituacionLegalEnum = z.enum(["regular", "irregular", "solicitante_asilo", "en_tramite", "sin_papeles"]);
const TipoViviendaEnum = z.enum(["calle", "albergue", "piso_compartido_alquiler", "piso_propio_alquiler", "piso_propio_propiedad", "ocupacion_sin_titulo", "pension", "asentamiento", "centro_acogida", "otros"]);
const EstabilidadHabitacionalEnum = z.enum(["sin_hogar", "inestable", "temporal", "estable"]);
const NivelEstudiosEnum = z.enum(["sin_estudios", "primaria", "secundaria", "bachillerato", "formacion_profesional", "universitario", "postgrado"]);
const SituacionLaboralEnum = z.enum(["desempleado", "economia_informal", "empleo_temporal", "empleo_indefinido", "autonomo", "en_formacion", "jubilado", "incapacidad_permanente", "sin_permiso_trabajo"]);
const NivelIngresosEnum = z.enum(["sin_ingresos", "menos_500", "entre_500_1000", "entre_1000_1500", "mas_1500"]);
const CanalLlegadaEnum = z.enum(["boca_a_boca", "cruz_roja", "servicios_sociales", "otra_ong", "internet", "presencial_directo", "whatsapp", "telefono", "email", "instagram", "retorno_bocatas", "otros"]);
const FaseItinerarioEnum = z.enum(["acogida", "estabilizacion", "formacion", "insercion_laboral", "autonomia"]);

const PersonCreateInput = z.object({
  canal_llegada: CanalLlegadaEnum,
  entidad_derivadora: z.string().max(200).optional().nullable(),
  persona_referencia: z.string().max(200).optional().nullable(),
  nombre: z.string().min(1).max(100),
  apellidos: z.string().min(1).max(150),
  fecha_nacimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  genero: GeneroEnum.optional().nullable(),
  pais_origen: z.string().length(2).optional().nullable(), // ISO 3166-1 alpha-2
  idioma_principal: IdiomaEnum,
  idiomas: z.array(IdiomaEnum).optional().nullable(),
  tipo_documento: TipoDocumentoEnum.optional().nullable(),
  numero_documento: z.string().max(30).optional().nullable(),
  situacion_legal: SituacionLegalEnum.optional().nullable(),
  fecha_llegada_espana: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  telefono: z.string().max(30).optional().nullable(),
  email: z.string().email().max(254).optional().nullable().or(z.literal("")),
  direccion: z.string().max(300).optional().nullable(),
  municipio: z.string().max(100).optional().nullable(),
  barrio_zona: z.string().max(100).optional().nullable(),
  tipo_vivienda: TipoViviendaEnum.optional().nullable(),
  estabilidad_habitacional: EstabilidadHabitacionalEnum.optional().nullable(),
  empadronado: z.boolean().optional().nullable(),
  nivel_estudios: NivelEstudiosEnum.optional().nullable(),
  situacion_laboral: SituacionLaboralEnum.optional().nullable(),
  nivel_ingresos: NivelIngresosEnum.optional().nullable(),
  recorrido_migratorio: z.string().max(2000).optional().nullable(),
  necesidades_principales: z.string().max(2000).optional().nullable(),
  restricciones_alimentarias: z.string().max(500).optional().nullable(),
  observaciones: z.string().max(2000).optional().nullable(),
  notas_privadas: z.string().max(2000).optional().nullable(),
  foto_perfil_url: z.string().url().optional().nullable(),
  foto_documento_url: z.string().url().optional().nullable(),
  fase_itinerario: FaseItinerarioEnum.optional(),
  program_ids: z.array(z.string().uuid()),
});

export const personsRouter = router({
  /**
   * Create a new person record.
   * Uses service role key to bypass RLS (Manus OAuth users have no Supabase JWT).
   */
  create: protectedProcedure
    .input(PersonCreateInput)
    .mutation(async ({ input }) => {
      const supabase = createAdminClient();
      const { program_ids: _, ...personData } = input;

      // Helper: convert empty strings to null to satisfy DB CHECK constraints
      const str = (v: string | null | undefined): string | null =>
        v === "" || v === undefined ? null : v;

      const insertPayload = {
        nombre: personData.nombre,
        apellidos: personData.apellidos,
        fecha_nacimiento: personData.fecha_nacimiento,
        genero: personData.genero ?? null,
        pais_origen: str(personData.pais_origen),
        idioma_principal: personData.idioma_principal,
        idiomas: personData.idiomas ?? null,
        telefono: str(personData.telefono),
        email: str(personData.email),
        direccion: str(personData.direccion),
        municipio: str(personData.municipio),
        barrio_zona: str(personData.barrio_zona),
        tipo_documento: personData.tipo_documento ?? null,
        numero_documento: str(personData.numero_documento),
        situacion_legal: personData.situacion_legal ?? null,
        fecha_llegada_espana: str(personData.fecha_llegada_espana),
        tipo_vivienda: personData.tipo_vivienda ?? null,
        estabilidad_habitacional: personData.estabilidad_habitacional ?? null,
        empadronado: personData.empadronado ?? null,
        nivel_estudios: personData.nivel_estudios ?? null,
        situacion_laboral: personData.situacion_laboral ?? null,
        nivel_ingresos: personData.nivel_ingresos ?? null,
        canal_llegada: personData.canal_llegada,
        entidad_derivadora: str(personData.entidad_derivadora),
        persona_referencia: str(personData.persona_referencia),
        recorrido_migratorio: str(personData.recorrido_migratorio),
        necesidades_principales: str(personData.necesidades_principales),
        restricciones_alimentarias: str(personData.restricciones_alimentarias),
        observaciones: str(personData.observaciones),
        notas_privadas: str(personData.notas_privadas),
        fase_itinerario: personData.fase_itinerario ?? undefined,
        foto_perfil_url: str(personData.foto_perfil_url),
        foto_documento_url: str(personData.foto_documento_url),
      };

      const { data: person, error } = await supabase
        .from("persons")
        .insert([insertPayload])
        .select("id, nombre, apellidos")
        .single();

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error al crear persona: ${error.message}`,
          cause: error,
        });
      }

      return person;
    }),

  /**
   * Enroll a person in one or more programs.
   * Uses service role key to bypass RLS.
   */
  enroll: protectedProcedure
    .input(z.object({
      personId: z.string().uuid(),
      programIds: z.array(z.string().uuid()),
    }))
    .mutation(async ({ input }) => {
      if (input.programIds.length === 0) return [];

      const supabase = createAdminClient();
      const rows = input.programIds.map((programId) => ({
        person_id: input.personId,
        program_id: programId,
        estado: "activo" as const,
      }));

      const { data, error } = await supabase
        .from("program_enrollments")
        .upsert(rows, { onConflict: "person_id,program_id" })
        .select("id, program_id, estado");

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error al inscribir en programas: ${error.message}`,
          cause: error,
        });
      }

      return data ?? [];
    }),

  /**
   * Get a single person by ID.
   * Uses service role key to bypass RLS.
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const supabase = createAdminClient();

      const { data, error } = await supabase
        .from("persons")
        .select("*")
        .eq("id", input.id)
        .is("deleted_at", null)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          throw new TRPCError({ code: "NOT_FOUND", message: "Persona no encontrada" });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error al obtener persona: ${error.message}`,
        });
      }

      return data;
    }),

  /**
   * Search persons by name.
   * Uses service role key to bypass RLS.
   */
  search: protectedProcedure
    .input(z.object({ query: z.string().min(2).max(100) }))
    .query(async ({ input }) => {
      const supabase = createAdminClient();
      const trimmed = input.query.trim();

      const { data, error } = await supabase
        .from("persons")
        .select("id, nombre, apellidos, fecha_nacimiento, foto_perfil_url, restricciones_alimentarias, fase_itinerario")
        .or(`nombre.ilike.%${trimmed}%,apellidos.ilike.%${trimmed}%`)
        .is("deleted_at", null)
        .order("nombre")
        .limit(20);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error en búsqueda: ${error.message}`,
        });
      }

      return data ?? [];
    }),

  /**
   * Get programs list (public data, but proxied through tRPC for consistency).
   * Uses service role key to ensure programs are always visible.
   */
  programs: protectedProcedure.query(async () => {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("programs")
      .select("id, slug, name, description, icon, is_default, is_active, display_order")
      .eq("is_active", true)
      .order("display_order");

    if (error) {
      // Return empty array on error — UI has fallback seed data
      return [];
    }

    return data ?? [];
  }),

  /**
   * Get consent templates for a given language.
   * Uses service role key to ensure templates are always visible.
   */
  consentTemplates: protectedProcedure
    .input(z.object({ idioma: z.enum(["es", "ar", "fr", "bm"]).default("es") }))
    .query(async ({ input }) => {
      const supabase = createAdminClient();

      const { data, error } = await supabase
        .from("consent_templates")
        .select("id, purpose, idioma, version, text_content, is_active, updated_at")
        .eq("idioma", input.idioma)
        .eq("is_active", true)
        .order("purpose");

      if (error) return [];
      return data ?? [];
    }),

  /**
   * Save consent records for a person.
   * Uses service role key to bypass RLS.
   */
  saveConsents: protectedProcedure
    .input(z.object({
      personId: z.string().uuid(),
      consents: z.array(z.object({
        purpose: z.enum(["tratamiento_datos_bocatas", "tratamiento_datos_banco_alimentos", "compartir_datos_red", "comunicaciones_whatsapp", "fotografia"]),
        idioma: z.enum(["es", "ar", "fr", "bm"]),
        granted: z.boolean(),
        granted_at: z.string(),
        consent_text: z.string().optional(),
        consent_version: z.string().optional(),
        documento_foto_url: z.string().url().optional().nullable(),
        registrado_por: z.string().uuid().optional().nullable(),
      })),
    }))
    .mutation(async ({ input }) => {
      if (input.consents.length === 0) return [];

      // Server-side enforcement: Group A consents are always required
      const GROUP_A = ["tratamiento_datos_bocatas", "fotografia", "comunicaciones_whatsapp"] as const;
      const submittedMap = new Map(input.consents.map((c) => [c.purpose, c.granted]));
      const missingA = GROUP_A.filter((p) => !submittedMap.has(p));
      if (missingA.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Faltan consentimientos obligatorios del Grupo A: ${missingA.join(", ")}`,
        });
      }
      const deniedA = GROUP_A.filter((p) => submittedMap.get(p) === false);
      if (deniedA.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "El Grupo A de consentimientos es obligatorio para completar el registro.",
        });
      }

      const supabase = createAdminClient();
      const rows = input.consents.map((c) => ({
        person_id: input.personId,
        purpose: c.purpose,
        idioma: c.idioma,
        granted: c.granted,
        granted_at: c.granted_at,
        consent_text: c.consent_text ?? "",
        consent_version: c.consent_version ?? "",
        documento_foto_url: c.documento_foto_url ?? null,
        registrado_por: c.registrado_por ?? null,
      }));

      const { data, error } = await supabase
        .from("consents")
        .upsert(rows, { onConflict: "person_id,purpose" })
        .select("id, purpose, granted");

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error al guardar consentimientos: ${error.message}`,
        });
      }

      return data ?? [];
    }),

  /**
   * Upload a photo (profile or consent document) to Manus CDN storage.
   * Accepts base64-encoded JPEG, returns a public CDN URL.
   */
  uploadPhoto: protectedProcedure
    .input(z.object({
      bucket: z.enum(["fotos-perfil", "documentos-consentimiento"]),
      base64: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const buffer = Buffer.from(input.base64, "base64");
      const randomSuffix = Math.random().toString(36).slice(2, 10);
      const key = `${input.bucket}/${Date.now()}-${randomSuffix}.jpg`;
      const { url } = await storagePut(key, buffer, "image/jpeg");
      return { url, key };
    }),

  createFamily: protectedProcedure
    .input(z.object({
      titularId: z.string().uuid(),
      miembros: z.array(z.object({
        nombre: z.string().min(1),
        apellidos: z.string().min(1),
        fecha_nacimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
        sexo: z.string().optional().nullable(),
        tipo_documento: z.string().optional().nullable(),
        numero_documento: z.string().optional().nullable(),
        pais: z.string().optional().nullable(),
        parentesco: z.string().optional().nullable(),
      })).optional().default([]),
      numAdultos: z.number().int().min(1).default(1),
      numMenores: z.number().int().min(0).default(0),
    }))
    .mutation(async ({ input }) => {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from("families")
        .insert([{
          titular_id: input.titularId,
          miembros: input.miembros,
          num_miembros: input.numAdultos + input.numMenores,
          num_adultos: input.numAdultos,
          num_menores_18: input.numMenores,
          estado: "activa",
        }])
        .select("id, familia_numero")
        .single();

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error al crear familia: ${error.message}`,
        });
      }
      return data;
    }),

  /**
   * getCheckinHistory — paginated check-in history for a person.
   * Returns { rows, total, hasMore } with location name, program, method, date, time.
   * Admin-only: protectedProcedure (any authenticated user can view for now).
   */
  getCheckinHistory: protectedProcedure
    .input(
      z.object({
        personId: z.string().regex(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
          "Invalid UUID format"
        ),
        limit: z.number().int().min(1).max(100).optional().default(20),
        offset: z.number().int().min(0).optional().default(0),
      })
    )
    .query(async ({ input }) => {
      const supabase = createAdminClient();

      const { data, error, count } = await supabase
        .from("attendances")
        .select(`
          id,
          checked_in_date,
          checked_in_at,
          created_at,
          programa,
          metodo,
          es_demo,
          notas,
          locations(nombre)
        `, { count: "exact" })
        .eq("person_id", input.personId)
        .is("deleted_at", null)
        .order("checked_in_date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(input.offset, input.offset + input.limit - 1);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error al obtener historial: ${error.message}`,
        });
      }

      const rows = (data ?? []).map((row: any) => ({
        id: row.id as string,
        fecha: row.checked_in_date as string,
        hora: row.checked_in_at
          ? new Date(row.checked_in_at).toLocaleTimeString("es-ES", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Europe/Madrid",
            })
          : new Date(row.created_at).toLocaleTimeString("es-ES", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Europe/Madrid",
            }),
        sede: (row.locations as any)?.nombre ?? "—",
        programa: row.programa as string,
        metodo: row.metodo as string,
        esDemo: row.es_demo as boolean,
        notas: row.notas as string | null,
      }));

      return {
        rows,
        total: count ?? 0,
        hasMore: (count ?? 0) > input.offset + input.limit,
      };
    }),
});
