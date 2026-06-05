import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../../_core/trpc";
import { createAdminClient, createUserImpersonationClient } from "../../../client/src/lib/supabase/server";
import { parseRow } from "../../csvLegacyFamiliasMapper";
import {
  parseCSVDocument,
  resolveColumnMap,
  fieldsToLegacyRow,
  REQUIRED_KEYS,
  type ColumnMap,
} from "../../csvLegacyFamiliasParser";
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
const MAX_FILENAME_LENGTH = 255;
/**
 * Conservative chunk size for `.in()` filters. PostgREST encodes IN-list
 * filters into the URL query string (typical ~8KB cap). 500 short tokens
 * stay well under that cap even when each value is 20+ chars.
 */
const PROBE_CHUNK_SIZE = 500;

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
  return cleaned.length === 0 ? null : cleaned.slice(0, MAX_FILENAME_LENGTH);
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
        src_filename: z.string().max(MAX_FILENAME_LENGTH).optional(),
      })
    )
    .mutation(async ({ input, ctx }): Promise<PreviewResponse> => {
      // Parse the WHOLE document quote-aware (G2): the real export's NOTAS
      // cells contain embedded newlines, so a line-by-line split shatters
      // ~92 records. parseCSVDocument treats newlines inside quotes as content.
      let records: string[][];
      try {
        records = parseCSVDocument(input.csv);
      } catch {
        // parseCSVDocument throws past its record ceiling (memory guard).
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "El archivo CSV es demasiado grande o está mal formado.",
        });
      }

      // Locate the header by STRUCTURE, not position: the first of the first
      // few records whose columns resolve (by name) to all REQUIRED_KEYS.
      // This tolerates the leading blank row + the multi-line CABEZA cell, and
      // — crucially (G1) — maps each canonical field to its true column even
      // though the real export interleaves 35 extra columns between them.
      let headerIdx = -1;
      let columnMap: ColumnMap | null = null;
      for (let i = 0; i < Math.min(records.length, 10); i++) {
        const candidate = resolveColumnMap(records[i]);
        if (REQUIRED_KEYS.every((k) => candidate.has(k))) {
          headerIdx = i;
          columnMap = candidate;
          break;
        }
      }
      if (headerIdx === -1 || !columnMap) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Encabezado no encontrado. Se requieren las columnas NUMERO FAMILIA BOCATAS, NOMBRE, APELLIDOS y CABEZA DE FAMILIA.",
        });
      }

      const dataRecords = records.slice(headerIdx + 1);
      if (dataRecords.length > MAX_BULK_ROWS) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `El CSV tiene ${dataRecords.length} filas de datos; el máximo por importación es ${MAX_BULK_ROWS}.`,
        });
      }

      const famIdx = columnMap.get("numero_familia")!;
      const cleanRows: CleanRow[] = [];
      const parseErrors: RowError[] = [];

      for (let r = 0; r < dataRecords.length; r++) {
        const rec = dataRecords[r];
        // Skip fully-blank rows and the right-hand pivot-stats block (rows with
        // no NUMERO FAMILIA BOCATAS).
        if (rec.every((c) => c.trim() === "")) continue;
        if (!(rec[famIdx] ?? "").trim()) continue;

        const legacy = fieldsToLegacyRow(rec, columnMap);
        // 1-based spreadsheet row number for operator-facing error messages.
        const rowNumber = headerIdx + 1 + r + 1;
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
      // Chunked: PostgREST encodes `.in()` filters into the URL query
      // string. For a 10k-row import with 4-char numbers that's ~50KB of
      // URL — well past the typical 8KB cap on PostgREST. CHUNK is sized
      // conservatively so even pathological inputs (long legacy numbers)
      // stay within the cap.
      const numeros = groups.map((g) => g.legacy_numero_familia);
      const existingSet = new Set<string>();
      for (let start = 0; start < numeros.length; start += PROBE_CHUNK_SIZE) {
        const chunk = numeros.slice(start, start + PROBE_CHUNK_SIZE);
        const { data: existingFams, error: famsErr } = await db
          .from("families")
          .select("legacy_numero")
          .in("legacy_numero", chunk)
          .is("deleted_at", null);
        if (famsErr) {
          ctx.logger.error("[legacy-import] families idempotency probe failed", {
            code: famsErr.code,
            chunkSize: chunk.length,
            correlationId: ctx.correlationId,
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Error consultando familias existentes.",
          });
        }
        for (const row of existingFams ?? []) {
          if (row.legacy_numero !== null) existingSet.add(row.legacy_numero);
        }
      }
      // Local mutation of `groups` — these objects were just constructed by
      // assembleFamilyGroups in this scope and are not shared state.
      // Rebuilding the array immutably would allocate ~3N objects with no
      // observable benefit; mutation here is a deliberate trade-off.
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
        for (let start = 0; start < dobList.length; start += PROBE_CHUNK_SIZE) {
          const chunk = dobList.slice(start, start + PROBE_CHUNK_SIZE);
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
          message: insertErr?.message,
          details: insertErr?.details,
          hint: insertErr?.hint,
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
        src_filename: z.string().max(MAX_FILENAME_LENGTH).optional(),
      })
    )
    .mutation(async ({ input, ctx }): Promise<ConfirmResponse> => {
      // Use admin client for ownership/TTL pre-check (service-role bypasses RLS).
      const adminDb = createAdminClient();
      const actorId = String(ctx.user.id);
      const safeName = safeFilename(input.src_filename);

      // Verify ownership + TTL up-front so we return NOT_FOUND cleanly
      // (the RPC also re-checks ownership inside the SECURITY DEFINER
      // boundary; this is defense in depth and a friendlier error path).
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: preview, error: fetchErr } = await adminDb
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

      // The RPC `confirm_legacy_familias_import` is SECURITY DEFINER and calls
      // `get_user_role()` → `auth.jwt() -> 'app_metadata' ->> 'role'` internally.
      // Calling it with the service-role key yields no user JWT, so get_user_role()
      // returns 'beneficiario' and the role check fails (42501).
      // Fix: sign a short-lived Supabase JWT for the authenticated user so the RPC
      // sees the correct role and uid.
      // IMPORTANT: sub must equal actorId (String(ctx.user.id)) because the RPC
      // checks `created_by = auth.uid()::text` for ownership verification.
      const userDb = await createUserImpersonationClient(
        actorId,
        ctx.user.role
      );

      const { data: result, error: rpcErr } = await userDb.rpc(
        "confirm_legacy_familias_import",
        {
          p_token: input.preview_token,
          p_src_filename: safeName ?? undefined,
        }
      );
      if (rpcErr) {
        // Cleanup the preview to avoid stuck tokens. Don't surface the raw
        // pg message to the client (could embed PII for constraint
        // violations); log it server-side and return a generic error.
        await adminDb
          .from("bulk_import_previews")
          .delete()
          .eq("token", input.preview_token);
        ctx.logger.error("[legacy-import] confirm RPC failed", {
          code: rpcErr.code,
          message: rpcErr.message,
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
