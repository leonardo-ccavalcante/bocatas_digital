import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../../_core/trpc";
import { ENV } from "../../_core/env";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { type AudienceRule } from "../../../shared/announcementTypes";
import {
  validateBulkRow,
  type ParsedBulkRow,
  type BulkRowError,
} from "../../announcements-helpers";
import {
  uuidLike,
  type WebhookPayload,
  fireUrgentWebhook,
  parseCSVLine,
} from "./_shared";

// Internal no-op used to avoid a TS warning about unused variable
function dismissedLookup(_id: string): boolean {
  return false;
}

export const bulkImportRouter = router({
  /**
   * previewBulkImport — parse CSV, validate rows, stash in bulk_import_previews.
   * Returns valid_count, per-row errors, and a preview_token (UUID).
   *
   * Hard cap at 10000 data rows to match the DB-side CHECK constraint
   * `bulk_import_previews_parsed_rows_max` (migration 20260506000008).
   * Above that, operators split the import.
   */
  previewBulkImport: adminProcedure
    .input(z.object({ csv: z.string().min(1).max(10_000_000) }))
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();

      const lines = input.csv
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .split("\n");

      const MAX_BULK_ROWS = 10000;
      const dataLineCount = lines.length - 1;
      if (dataLineCount > MAX_BULK_ROWS) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `El CSV tiene ${dataLineCount} filas de datos; el máximo por importación es ${MAX_BULK_ROWS}. Divide el archivo en lotes más pequeños.`,
        });
      }

      const EXPECTED_HEADERS = [
        "titulo",
        "contenido",
        "tipo",
        "es_urgente",
        "fecha_inicio",
        "fecha_fin",
        "fijado",
        "audiencias",
      ];

      if (lines.length < 2) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "El CSV debe tener encabezado y al menos una fila de datos.",
        });
      }

      const headerFields = parseCSVLine(lines[0]);
      const headerMatch = EXPECTED_HEADERS.every(
        (h, i) => headerFields[i] === h
      );
      if (!headerMatch) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Encabezado inválido. Esperado: ${EXPECTED_HEADERS.join(",")}.`,
        });
      }

      type ParsedBulkRowWithLine = ParsedBulkRow & { row_number: number };
      const valid: ParsedBulkRowWithLine[] = [];
      const errors: BulkRowError[] = [];
      let lineNumber = 1;

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        lineNumber = i + 1;

        const fields = parseCSVLine(line);
        const rowInput = {
          titulo: fields[0],
          contenido: fields[1],
          tipo: fields[2],
          es_urgente: fields[3],
          fecha_inicio: fields[4],
          fecha_fin: fields[5],
          fijado: fields[6],
          audiencias: fields[7],
        };

        const result = validateBulkRow(rowInput, lineNumber);
        if (!result.ok) {
          errors.push(...result.errors);
        } else if (result.parsed) {
          valid.push({ ...result.parsed, row_number: lineNumber });
        }
      }

      const { data: preview, error: previewErr } = await db
        .from("bulk_import_previews")
        .insert({
          parsed_rows: valid as unknown as never,
          created_by: String(ctx.user.id),
        })
        .select("token")
        .single();

      if (previewErr || !preview) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error al guardar previsualización: ${previewErr?.message ?? "unknown"}`,
        });
      }

      return {
        valid,
        valid_count: valid.length,
        errors,
        preview_token: (preview as { token: string }).token,
      };
    }),

  /**
   * confirmBulkImport — read preview, call pg function, fire webhooks, cleanup.
   */
  confirmBulkImport: adminProcedure
    .input(z.object({ preview_token: uuidLike }))
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();
      const createdBy = String(ctx.user.id);
      const autorNombre = ctx.user.name ?? null;

      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: preview, error: fetchErr } = await db
        .from("bulk_import_previews")
        .select("token, parsed_rows, created_by, created_at")
        .eq("token", input.preview_token)
        .eq("created_by", createdBy)
        .gte("created_at", thirtyMinAgo)
        .maybeSingle();

      if (fetchErr || !preview) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "preview expired or not found",
        });
      }

      const { data: result, error: rpcErr } = await db.rpc(
        "confirm_bulk_announcement_import",
        {
          p_token: input.preview_token,
          p_autor_id: createdBy,
          p_autor_nombre: autorNombre,
        }
      );

      let created_count = 0;
      let error_count = 0;

      if (rpcErr) {
        const total = (
          preview.parsed_rows as unknown as ParsedBulkRow[]
        ).length;
        await db
          .from("bulk_import_previews")
          .delete()
          .eq("token", input.preview_token);
        return {
          created_count: 0,
          error_count: total,
          failed_rows: [{ row: 0, error: rpcErr.message }],
        };
      }

      const rpcResult = result as
        | { created_count: number; error_count: number }
        | null;
      created_count = rpcResult?.created_count ?? 0;
      error_count = rpcResult?.error_count ?? 0;

      const parsedRows = (
        preview.parsed_rows as unknown as ParsedBulkRow[]
      ).filter((r) => r.es_urgente);

      if (parsedRows.length > 0) {
        const { data: newRows } = await db
          .from("announcements")
          .select("id, titulo, contenido, tipo, fecha_inicio, fecha_fin, autor_nombre, announcement_audiences(roles, programs)")
          .eq("autor_id", createdBy)
          .eq("activo", true)
          .order("created_at", { ascending: false })
          .limit(parsedRows.length * 2);

        const webhookFires = (newRows ?? [])
          .filter((row: { id: string }) => !dismissedLookup(row.id))
          .slice(0, parsedRows.length)
          .map((row: {
            id: string;
            titulo: string;
            contenido: string;
            tipo: string;
            fecha_inicio: string | null;
            fecha_fin: string | null;
            announcement_audiences: unknown;
          }) => {
            const payload: WebhookPayload = {
              event: "announcement.urgent.created",
              announcement_id: row.id,
              titulo: row.titulo,
              contenido_preview: row.contenido.slice(0, 280),
              tipo: row.tipo,
              fecha_inicio: row.fecha_inicio ?? null,
              fecha_fin: row.fecha_fin ?? null,
              audiences: (row.announcement_audiences as AudienceRule[]) ?? [],
              autor_nombre: autorNombre,
              app_url: `${ENV.appUrl}/novedades/${row.id}`,
            };
            return fireUrgentWebhook(payload).catch(() => undefined);
          });
        void Promise.all(webhookFires).catch(() => undefined);
      }

      await db
        .from("bulk_import_previews")
        .delete()
        .eq("token", input.preview_token);

      return { created_count, error_count, failed_rows: [] as { row: number; error: string }[] };
    }),
});
