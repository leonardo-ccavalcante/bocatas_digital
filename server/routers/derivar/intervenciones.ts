/**
 * intervenciones.ts — derivar.addIntervention, list, getHoja, attachSigned,
 *   excludeIntervention, uploadSignedHoja, activateTemplate, uploadSecondaryLogo
 *
 * addIntervention: Upserts the open hoja for (entity, programa) — respecting
 * the partial unique index that allows only one active hoja per entity+programa
 * — then inserts the intervention row with a frozen institucion_snapshot.
 *
 * list: Returns interventions for a programa with optional filters.
 *
 * getHoja: Returns a single hoja with all its interventions (excluding excluded ones).
 *
 * attachSigned: Attaches a firmado_url to the hoja (not individual intervention).
 *
 * excludeIntervention: Soft-deletes an intervention with audit log.
 *
 * uploadSignedHoja: Uploads a signed PDF and attaches it to the hoja.
 *
 * activateTemplate: Sets the active DOCX template in app_settings.
 *
 * uploadSecondaryLogo: Uploads a secondary logo image and stores its key.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { InterventionInsertSchema } from "../../../shared/derivar/types";
import { router, adminProcedure } from "../../_core/trpc";
import { TEMPLATE_BUCKET } from "../../../shared/derivar/templatePlaceholders";
import { resolveProfesionalNombre } from "./_shared";

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const intervencionesRouter = router({
  /**
   * Adds one intervention. Upserts the open hoja for (entity, programa) if it
   * does not exist yet, then inserts the intervention row with a frozen
   * institucion_snapshot (JSONB).
   */
  addIntervention: adminProcedure
    .input(InterventionInsertSchema)
    .mutation(async ({ ctx, input }) => {
      const db = createAdminClient();

      // 1. Find or create the active hoja.
      // When existingHojaId is provided, skip the find/create entirely.
      // Idempotent under concurrency: two simultaneous first-interventions can
      // both miss the find; the partial unique index then rejects the loser
      // with 23505, so we re-fetch and reuse the winner's hoja.
      const findActiveHoja = async () => {
        const base = db
          .from("derivacion_hojas")
          .select("id, fecha_apertura")
          .eq("programa_id", input.programaId)
          .eq("estado", "activa")
          .eq("scope", input.scope);
        const scoped =
          input.scope === "persona"
            ? base.eq("persona_id", input.entityId)
            : base.eq("familia_id", input.entityId);
        const { data } = await scoped.maybeSingle();
        return data;
      };

      let hojaId: string;

      if (input.existingHojaId) {
        // Append to an existing hoja — verify it exists and is active
        const { data: existingHoja, error: fetchErr } = await db
          .from("derivacion_hojas")
          .select("id, estado")
          .eq("id", input.existingHojaId)
          .maybeSingle();
        if (fetchErr || !existingHoja) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Hoja no encontrada" });
        }
        if (existingHoja.estado === "cerrada") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No se puede añadir una intervención a una hoja cerrada",
          });
        }
        hojaId = existingHoja.id;
      } else {
        const existing = await findActiveHoja();

        if (existing) {
          hojaId = existing.id;
        } else {
          const profesionalNombre = resolveProfesionalNombre(ctx.user);

          type HojaInsert = {
            scope: string;
            programa_id: string;
            profesional_id: string;
            profesional_nombre: string;
            fecha_apertura: string;
            estado: string;
            persona_id?: string;
            familia_id?: string;
          };

          const hojaInsert: HojaInsert = {
            scope: input.scope,
            programa_id: input.programaId,
            profesional_id: String(ctx.user.id),
            profesional_nombre: profesionalNombre,
            fecha_apertura: input.fecha,
            estado: "activa",
          };
          if (input.scope === "persona") {
            hojaInsert.persona_id = input.entityId;
          } else {
            hojaInsert.familia_id = input.entityId;
          }

          const { data: created, error: createErr } = await db
            .from("derivacion_hojas")
            .insert(hojaInsert)
            .select("id")
            .single();
          if (createErr || !created) {
            // Lost the create race: another request opened the active hoja
            // between our find and insert. Re-fetch and reuse it.
            if (createErr?.code === "23505") {
              const raced = await findActiveHoja();
              if (!raced) {
                throw new TRPCError({
                  code: "INTERNAL_SERVER_ERROR",
                  message: "Hoja create failed",
                });
              }
              hojaId = raced.id;
            } else {
              throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: createErr?.message ?? "Hoja create failed",
              });
            }
          } else {
            hojaId = created.id;
          }
        }
      }

      // 2. Resolve institucion_snapshot — freeze at insert time
      type Snapshot = {
        nombre: string;
        direccion: string | null;
        telefono: string | null;
        email: string | null;
        codigo_postal: string | null;
      };

      let snapshot: Snapshot | null = input.institucionSnapshot ?? null;
      if (!snapshot && input.institucionId) {
        const { data: inst } = await db
          .from("instituciones")
          .select("nombre, direccion, telefono, email, codigo_postal")
          .eq("id", input.institucionId)
          .maybeSingle();
        // Fail loud rather than silently freezing a null snapshot (which would
        // print a blank "Recurso" on the Hoja and lose the referral target).
        if (!inst) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Institución no encontrada",
          });
        }
        snapshot = {
          nombre: inst.nombre,
          direccion: inst.direccion,
          telefono: inst.telefono,
          email: inst.email,
          codigo_postal: inst.codigo_postal,
        };
      }

      // 3. Insert the intervention row
      const { data: row, error: rowErr } = await db
        .from("derivacion_intervenciones")
        .insert({
          hoja_id: hojaId,
          fecha: input.fecha,
          tipo_slug: input.tipoSlug,
          descripcion: input.descripcion,
          institucion_id: input.institucionId ?? null,
          institucion_snapshot: snapshot,
          observaciones: input.observaciones ?? null,
          created_by: String(ctx.user.id),
        })
        .select("id")
        .single();
      if (rowErr || !row) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: rowErr?.message ?? "Insert failed",
        });
      }

      ctx.logger.info(`derivar.addIntervention hoja=${hojaId} intervencion=${row.id}`);
      return { hojaId, intervencionId: row.id };
    }),

  /** List interventions for a programa with optional filters. */
  list: adminProcedure
    .input(
      z.object({
        programaId: z.string().uuid(),
        tipoSlug: z.string().optional(),
        institucionId: z.string().uuid().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        limit: z.number().int().min(1).max(500).default(100),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ input }) => {
      const db = createAdminClient();

      let q = db
        .from("derivacion_intervenciones")
        .select(
          `*, hoja:derivacion_hojas!inner(
            id, scope, programa_id, fecha_apertura, estado, profesional_nombre,
            persona:persons(nombre, apellidos),
            familia:families(familia_numero, titular:persons!titular_id(nombre, apellidos))
          )`,
        )
        .eq("hoja.programa_id", input.programaId)
        .is("excluded_at", null) // exclude soft-deleted interventions
        .order("fecha", { ascending: false })
        .range(input.offset, input.offset + input.limit - 1);

      if (input.tipoSlug) q = q.eq("tipo_slug", input.tipoSlug);
      if (input.institucionId) q = q.eq("institucion_id", input.institucionId);
      if (input.from) q = q.gte("fecha", input.from);
      if (input.to) q = q.lte("fecha", input.to);

      const { data, error } = await q;
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }
      return data ?? [];
    }),

  /** Get a single hoja with all its non-excluded interventions. */
  getHoja: adminProcedure
    .input(z.object({ hojaId: z.string().uuid() }))
    .query(async ({ input }) => {
      const db = createAdminClient();

      const { data: hoja, error: hErr } = await db
        .from("derivacion_hojas")
        .select(
          `*,
          persona:persons(nombre, apellidos),
          familia:families(familia_numero, titular:persons!titular_id(nombre, apellidos)),
          programa:programs(name)`,
        )
        .eq("id", input.hojaId)
        .single();
      if (hErr || !hoja) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const { data: rows } = await db
        .from("derivacion_intervenciones")
        .select("*")
        .eq("hoja_id", input.hojaId)
        .is("excluded_at", null) // filter out excluded interventions
        .order("fecha", { ascending: true });

      return { hoja, intervenciones: rows ?? [] };
    }),

  /**
   * Attach a signed PDF URL to the hoja (not individual intervention).
   * Stores firmado_url and firmado_at on derivacion_hojas.
   */
  attachSigned: adminProcedure
    .input(z.object({ hojaId: z.string().uuid(), firmadoUrl: z.string().url() }))
    .mutation(async ({ input }) => {
      const db = createAdminClient();

      const { error } = await db
        .from("derivacion_hojas")
        .update({
          firmado_url: input.firmadoUrl,
          firmado_at: new Date().toISOString(),
        })
        .eq("id", input.hojaId);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return { success: true };
    }),

  /**
   * Soft-deletes an intervention with audit log.
   * Sets excluded_at, excluded_by, and excluded_reason.
   */
  excludeIntervention: adminProcedure
    .input(
      z.object({
        intervencionId: z.string().uuid(),
        reason: z.string().min(1).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = createAdminClient();

      // Verify the intervention exists and is not already excluded
      const { data: existing, error: fetchErr } = await db
        .from("derivacion_intervenciones")
        .select("id, hoja_id, excluded_at")
        .eq("id", input.intervencionId)
        .maybeSingle();

      if (fetchErr || !existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Intervención no encontrada" });
      }
      if (existing.excluded_at) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "La intervención ya está excluida" });
      }

      const { error } = await db
        .from("derivacion_intervenciones")
        .update({
          excluded_at: new Date().toISOString(),
          excluded_by: String(ctx.user.id),
          excluded_reason: input.reason,
        })
        .eq("id", input.intervencionId);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      ctx.logger.info(
        `derivar.excludeIntervention id=${input.intervencionId} by=${ctx.user.id} reason="${input.reason}"`,
      );
      return { success: true, hojaId: existing.hoja_id };
    }),

  /**
   * Upload a signed PDF for a hoja to Supabase Storage and attach the URL.
   * Accepts a base64-encoded PDF file.
   */
  uploadSignedHoja: adminProcedure
    .input(
      z.object({
        hojaId: z.string().uuid(),
        fileBase64: z.string().min(1),
        originalName: z.string().min(1).max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = createAdminClient();

      const buf = Buffer.from(input.fileBase64, "base64");

      // Validate PDF magic bytes: %PDF
      if (
        buf.length < 4 ||
        buf[0] !== 0x25 ||
        buf[1] !== 0x50 ||
        buf[2] !== 0x44 ||
        buf[3] !== 0x46
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "El archivo no parece un PDF válido.",
        });
      }

      const timestamp = Date.now();
      const safeName = input.originalName
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .replace(/\.pdf$/i, "");
      const fileKey = `derivaciones-firmadas/${input.hojaId}_${timestamp}_${safeName}.pdf`;

      const { error: uploadErr } = await db.storage
        .from("derivaciones-firmadas")
        .upload(fileKey, buf, {
          contentType: "application/pdf",
          upsert: false,
        });

      if (uploadErr) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error al subir el archivo: ${uploadErr.message}`,
        });
      }

      // Get public URL
      const { data: urlData } = db.storage
        .from("derivaciones-firmadas")
        .getPublicUrl(fileKey);

      const firmadoUrl = urlData.publicUrl;

      // Update the hoja
      const { error: updateErr } = await db
        .from("derivacion_hojas")
        .update({
          firmado_url: firmadoUrl,
          firmado_at: new Date().toISOString(),
        })
        .eq("id", input.hojaId);

      if (updateErr) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: updateErr.message,
        });
      }

      ctx.logger.info(`derivar.uploadSignedHoja hoja=${input.hojaId} url=${firmadoUrl}`);
      return { success: true, firmadoUrl };
    }),

  /**
   * Sets the active DOCX template in app_settings.
   * The filename must exist in the program-document-templates bucket.
   */
  activateTemplate: adminProcedure
    .input(z.object({ filename: z.string().min(1).max(300) }))
    .mutation(async ({ ctx, input }) => {
      const db = createAdminClient();

      // Verify the file exists in storage
      const { data: files, error: listErr } = await db.storage
        .from(TEMPLATE_BUCKET)
        .list();

      if (listErr) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error al verificar plantilla: ${listErr.message}`,
        });
      }

      const exists = (files ?? []).some((f) => f.name === input.filename);
      if (!exists) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Plantilla "${input.filename}" no encontrada en Storage.`,
        });
      }

      // Upsert the app_settings record
      const { error } = await db
        .from("app_settings")
        .upsert(
          { key: "derivar_active_template", value: input.filename },
          { onConflict: "key" },
        );

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      ctx.logger.info(`derivar.activateTemplate filename=${input.filename} by=${ctx.user.id}`);
      return { success: true, filename: input.filename };
    }),

  /**
   * Uploads a secondary logo image (PNG/JPG) to Storage and stores its key
   * in app_settings so it is used in future document generation.
   */
  uploadSecondaryLogo: adminProcedure
    .input(
      z.object({
        fileBase64: z.string().min(1),
        originalName: z.string().min(1).max(200),
        mimeType: z.enum(["image/png", "image/jpeg", "image/jpg"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = createAdminClient();

      const buf = Buffer.from(input.fileBase64, "base64");

      // Validate image magic bytes
      const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
      const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
      if (!isPng && !isJpeg) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "El archivo no parece una imagen PNG o JPEG válida.",
        });
      }

      const ext = isPng ? "png" : "jpg";
      const timestamp = Date.now();
      const fileKey = `logos/secondary_logo_${timestamp}.${ext}`;

      const { error: uploadErr } = await db.storage
        .from(TEMPLATE_BUCKET)
        .upload(fileKey, buf, {
          contentType: input.mimeType,
          upsert: true,
        });

      if (uploadErr) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error al subir el logo: ${uploadErr.message}`,
        });
      }

      // Store the key in app_settings
      const { error } = await db
        .from("app_settings")
        .upsert(
          { key: "derivar_secondary_logo_key", value: fileKey },
          { onConflict: "key" },
        );

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      ctx.logger.info(`derivar.uploadSecondaryLogo key=${fileKey} by=${ctx.user.id}`);
      return { success: true, fileKey };
    }),
});
