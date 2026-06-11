/**
 * intervenciones-uploads.ts — derivar signing, template and logo storage procedures.
 *
 * Split out of intervenciones.ts (SIS-01: max-lines) — pure extraction, no
 * behaviour change. Merged back into the flat `derivar.*` surface by
 * derivar/index.ts via mergeRouters, so client call sites are unchanged.
 *
 * attachSigned: Attaches a firmado_url to the hoja (not individual intervention).
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
import { router, adminProcedure } from "../../_core/trpc";
import { TEMPLATE_BUCKET } from "../../../shared/derivar/templatePlaceholders";

export const intervencionesUploadsRouter = router({
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
