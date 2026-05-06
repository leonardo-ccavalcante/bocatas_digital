import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { parseCSVLine } from "../announcements/_shared";
import {
  fieldsToLegacyRow,
  parseRow,
} from "../../csvLegacyFamiliasMapper";
import { assembleFamilyGroups } from "../../csvLegacyFamiliasGroup";
import {
  type CleanRow,
  type PersonDedupHit,
  type PreviewResponse,
  type RowError,
  type StashPayload,
  type ConfirmResponse,
  ConfirmResponseSchema,
} from "../../../shared/legacyFamiliasTypes";
import { uuidLike } from "./_shared";

const MAX_BULK_ROWS = 10_000;

interface PersonProbeRow {
  id: string;
  nombre: string;
  apellidos: string | null;
  fecha_nacimiento: string | null;
  pais_origen: string | null;
}

function probeKey(nombre: string, apellidos: string, fecha: string | null): string {
  return `${nombre.toLowerCase()}|${apellidos.toLowerCase()}|${fecha ?? ""}`;
}

/**
 * Restrict the file name to its basename to defang any path-traversal
 * payload before we persist it into family metadata or the audit log.
 * The filename is user-supplied (browser File.name) so we treat it as
 * untrusted even though we never reconstruct a server-side path from it.
 *
 * Exported so the contract is unit-testable.
 */
export function safeFilename(input: string | undefined): string | null {
  if (!input) return null;
  // Strip any path component; keep only the trailing segment.
  const lastSlash = Math.max(input.lastIndexOf("/"), input.lastIndexOf("\\"));
  const base = lastSlash >= 0 ? input.slice(lastSlash + 1) : input;
  // Drop any control character that could mangle log output.
  const cleaned = base.replace(/[\x00-\x1f]/g, "").trim();
  return cleaned.length === 0 ? null : cleaned.slice(0, 255);
}

export const legacyImportRouter = router({
  /**
   * previewLegacyImport — parse legacy FAMILIAS CSV, validate per-row + per-group,
   * probe DB for dedup hits, stash to bulk_import_previews. Returns a token + summary.
   *
   * Body cap is 10MB raw; row cap is 10_000 lines (matches announcements importer).
   */
  previewLegacyImport: adminProcedure
    .input(
      z.object({
        csv: z.string().min(1).max(10_000_000),
        src_filename: z.string().max(255).optional(),
      })
    )
    .mutation(async ({ input, ctx }): Promise<PreviewResponse> => {
      const csvNormalised = input.csv
        .replace(/^﻿/, "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");

      const rawLines = csvNormalised.split("\n");

      // Find the header row: first non-empty line whose first non-empty field
      // matches "NÚMERO DE ORDEN" (case-sensitive). Tolerates leading blank /
      // metadata rows like the user's CSV which has an empty row 1 and a
      // multi-line header in rows 2-3.
      let headerLineIdx = -1;
      for (let i = 0; i < rawLines.length; i++) {
        const fields = parseCSVLine(rawLines[i]);
        if (fields[0]?.trim().startsWith("NÚMERO DE ORDEN")) {
          headerLineIdx = i;
          break;
        }
      }
      if (headerLineIdx === -1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Encabezado no encontrado. La primera columna debe ser 'NÚMERO DE ORDEN'.",
        });
      }

      // Detect whether the header is split across two physical rows (the user's
      // CSV puts CABEZA DE FAMILIA on one row and "(MARCAR CON UNA X DONDE
      // PROCEDA)" on the next). When the header is split, the second row's
      // first column is also part of the header line — rejoin and skip.
      let dataStartLine = headerLineIdx + 1;
      const nextLine = rawLines[headerLineIdx + 1] ?? "";
      const nextFields = parseCSVLine(nextLine);
      // Heuristic: if the next row has fewer than half the columns of the
      // header AND its first non-empty field looks like the parenthetical
      // continuation, treat it as a header continuation.
      if (
        nextFields[0]?.trim().startsWith("(MARCAR CON UNA X")
      ) {
        dataStartLine = headerLineIdx + 2;
      }

      // Hard cap on data row count.
      const dataLineCount = rawLines.length - dataStartLine;
      if (dataLineCount > MAX_BULK_ROWS) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `El CSV tiene ${dataLineCount} filas de datos; el máximo por importación es ${MAX_BULK_ROWS}.`,
        });
      }

      const cleanRows: CleanRow[] = [];
      const parseErrors: RowError[] = [];

      for (let i = dataStartLine; i < rawLines.length; i++) {
        const line = rawLines[i];
        if (!line.trim()) continue;
        const fields = parseCSVLine(line).map((f) => f.trim());
        // Skip rows with no NUMERO FAMILIA BOCATAS — they are blank or trailing.
        if (!fields[1]) continue;

        const legacy = fieldsToLegacyRow(fields);
        // The CSV's row indices are 1-based (line 1 in spreadsheet view).
        const rowNumber = i + 1;
        const result = parseRow(legacy, rowNumber);
        if (result.ok) {
          cleanRows.push(result.row);
        } else {
          parseErrors.push(result.error);
        }
      }

      if (cleanRows.length === 0 && parseErrors.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "El CSV no contiene filas de datos válidas.",
        });
      }

      const groups = assembleFamilyGroups(cleanRows);

      // ── DB probes ────────────────────────────────────────────────────────
      const db = createAdminClient();

      // 1. Idempotency probe: which legacy_numero already exist?
      const numeros = groups.map((g) => g.legacy_numero_familia);
      // `legacy_numero` is added by migration 20260601000001; the generated
      // database.types.ts may not yet reflect it. Cast through unknown to
      // preserve runtime correctness without relying on regenerated types.
      const { data: existingFamsRaw, error: famsErr } = await db
        .from("families")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("legacy_numero" as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .in("legacy_numero" as any, numeros)
        .is("deleted_at", null);
      if (famsErr) {
        ctx.logger.error("[legacy-import] families idempotency probe failed", {
          code: famsErr.code,
          correlationId: ctx.correlationId,
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Error consultando familias existentes.",
        });
      }
      const existingFams = (existingFamsRaw ?? []) as unknown as Array<{
        legacy_numero: string | null;
      }>;
      const existingSet = new Set(
        existingFams
          .map((f) => f.legacy_numero)
          .filter((v): v is string => v !== null)
      );
      for (const g of groups) {
        if (existingSet.has(g.legacy_numero_familia)) {
          g.family_already_imported = true;
        }
      }

      // 2. Person dedup probe.
      //
      // Strategy: collect all unique (nombre, apellidos, dob) triples from
      // the CSV; query persons restricted by `fecha_nacimiento IN (...dobs)`
      // (parameterized via Supabase JS client — no string interpolation),
      // then filter the candidate set in-memory by exact (nombre, apellidos)
      // match per probe. This avoids hand-crafting PostgREST `or()` filter
      // strings (injection risk) and keeps the dedup probe to a single
      // SELECT regardless of probe count.
      const dobSet = new Set<string>();
      for (const g of groups) {
        for (const r of g.rows) {
          if (r.person.fecha_nacimiento) dobSet.add(r.person.fecha_nacimiento);
        }
      }
      const probeKeyToRow = new Map<string, PersonProbeRow>();
      if (dobSet.size > 0) {
        const dobList = [...dobSet];
        // Chunk on the IN clause itself (parameterized) — no character cap to
        // worry about. 500 is a safe-and-generous chunk size for Supabase.
        const CHUNK = 500;
        for (let start = 0; start < dobList.length; start += CHUNK) {
          const chunk = dobList.slice(start, start + CHUNK);
          const { data: rows, error: probeErr } = await db
            .from("persons")
            .select("id, nombre, apellidos, fecha_nacimiento, pais_origen")
            .in("fecha_nacimiento", chunk)
            .is("deleted_at", null);
          if (probeErr) {
            // Soft-fail: dedup is advisory; log and continue without it
            // rather than blocking the whole preview. PII-free message.
            ctx.logger.warn(
              `[legacy-import] person dedup probe failed (chunk size ${chunk.length})`,
              { code: probeErr.code, correlationId: ctx.correlationId }
            );
            break;
          }
          for (const row of (rows ?? []) as PersonProbeRow[]) {
            probeKeyToRow.set(
              probeKey(row.nombre, row.apellidos ?? "", row.fecha_nacimiento),
              row
            );
          }
        }
      }

      for (const g of groups) {
        const hits: PersonDedupHit[] = [];
        for (let idx = 0; idx < g.rows.length; idx++) {
          const r = g.rows[idx];
          const dob = r.person.fecha_nacimiento;
          if (!dob) continue;
          const match = probeKeyToRow.get(
            probeKey(r.person.nombre, r.person.apellidos, dob)
          );
          if (match) {
            hits.push({
              row_index: idx,
              existing_person_id: match.id,
              existing_pais_origen: match.pais_origen,
            });
          }
        }
        g.person_dedup_hits = hits;
      }

      // ── Stash + return ────────────────────────────────────────────────────
      const stash: StashPayload = {
        groups,
        src_filename: safeFilename(input.src_filename),
      };

      const { data: preview, error: insertErr } = await db
        .from("bulk_import_previews")
        .insert({
          // Cast through unknown — see announcements/bulk-import.ts for the
          // pattern; runtime correctness is preserved by the Zod stash schema.
          parsed_rows: stash as unknown as never,
          created_by: String(ctx.user.id),
        })
        .select("token")
        .single();
      if (insertErr || !preview) {
        ctx.logger.error("[legacy-import] preview stash failed", {
          code: insertErr?.code,
          correlationId: ctx.correlationId,
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Error guardando previsualización.",
        });
      }

      // Counts.
      const total_families = groups.length;
      // Classify each group into exactly one bucket so the four counts
      // partition cleanly (no double-counting on errors-AND-duplicate).
      // Order matches the modal's classifyGroup() priority:
      //   errors > duplicate > warnings > ok.
      let error_families = 0;
      let duplicate_families = 0;
      let warning_families = 0;
      let valid_families = 0;
      for (const g of groups) {
        if (g.errors.length > 0) {
          error_families++;
        } else if (g.family_already_imported) {
          duplicate_families++;
        } else if (
          g.person_dedup_hits.length > 0 ||
          g.rows.some((r) => r.warnings.length > 0)
        ) {
          warning_families++;
        } else {
          valid_families++;
        }
      }

      return {
        preview_token: (preview as { token: string }).token,
        total_rows: cleanRows.length + parseErrors.length,
        total_families,
        valid_families,
        warning_families,
        error_families,
        duplicate_families,
        groups,
        parse_errors: parseErrors,
      };
    }),

  /**
   * confirmLegacyImport — call confirm_legacy_familias_import RPC. Per-family
   * savepoints commit each family independently; the RPC also handles audit
   * + preview cleanup atomically.
   */
  confirmLegacyImport: adminProcedure
    .input(
      z.object({
        preview_token: uuidLike,
        src_filename: z.string().max(255).optional(),
      })
    )
    .mutation(async ({ input, ctx }): Promise<ConfirmResponse> => {
      const db = createAdminClient();
      const actorId = String(ctx.user.id);
      const safeName = safeFilename(input.src_filename);

      // Verify ownership + TTL up-front so we return NOT_FOUND cleanly
      // (the RPC also re-checks ownership inside the SECURITY DEFINER
      // boundary; this is defense in depth and a friendlier error path).
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: preview, error: fetchErr } = await db
        .from("bulk_import_previews")
        .select("token, created_by, created_at")
        .eq("token", input.preview_token)
        .eq("created_by", actorId)
        .gte("created_at", thirtyMinAgo)
        .maybeSingle();
      if (fetchErr || !preview) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Previsualización expirada o no encontrada.",
        });
      }

      const { data: result, error: rpcErr } = await db.rpc(
        // RPC signature isn't yet in the generated database.types.ts; cast
        // to keep the call site honest until `supabase gen types` is rerun.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "confirm_legacy_familias_import" as any,
        {
          p_token: input.preview_token,
          p_src_filename: safeName,
        }
      );
      if (rpcErr) {
        // Cleanup the preview to avoid stuck tokens. Don't surface the raw
        // pg message to the client (could embed PII for constraint
        // violations); log it server-side and return a generic error.
        await db
          .from("bulk_import_previews")
          .delete()
          .eq("token", input.preview_token);
        ctx.logger.error("[legacy-import] confirm RPC failed", {
          code: rpcErr.code,
          correlationId: ctx.correlationId,
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Error al confirmar la importación.",
        });
      }

      const parsed = ConfirmResponseSchema.safeParse(result);
      if (!parsed.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Respuesta del RPC con shape inválido.",
        });
      }
      return parsed.data;
    }),
});
