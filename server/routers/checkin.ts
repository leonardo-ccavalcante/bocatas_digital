/**
 * checkin.ts — tRPC router for QR Check-in (Epic B).
 *
 * Uses createAdminClient() (service role key) to bypass RLS since the app
 * uses Manus OAuth — users have no Supabase JWT.
 * Authorization enforced at tRPC layer via protectedProcedure.
 */
import { TRPCError } from "@trpc/server";
import { signPathField, AVATAR_BUCKET } from "../storage";
import { z } from "zod";
import { createAdminClient } from "../../client/src/lib/supabase/server";
import { voluntarioProcedure, router } from "../_core/trpc";
import { logProcedureAction, logProcedureError, logCorrelatedErrorToStderr } from "../_core/logging-middleware";
import { ENV } from "../_core/env";
import { parseQrPayload, verifySig } from "../../shared/qr/payload";
import { ilikeValue } from "../_core/postgrestFilter";
import { nameSearchTokens } from "../../shared/nameSearch";
import {
  enrichOfflineItems,
  offlineAttendanceRows,
  offlineSyncResults,
} from "./checkin.offlineSync";

import { uuidLike, ProgramaSlug, MetodoEnum } from "./checkin.schemas";
import { authActorId } from "../_core/actorId";

async function listActivePrograms(supabase: ReturnType<typeof createAdminClient>) {
  const { data, error } = await supabase
    .from("programs")
    .select("id, slug, name, icon, is_default")
    .eq("is_active", true)
    .order("display_order");
  if (error) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  }
  return data ?? [];
}

// ─── Router ───────────────────────────────────────────────────────────────────
export const checkinRouter = router({
  /**
   * verifyAndInsert — verify person exists, insert attendance, return result.
   * Returns:
   *   { status: 'registered', restriccionesAlimentarias: string | null }
   *   { status: 'duplicate', lastCheckinTime: string }
   *   { status: 'not_found' }
   */
  verifyAndInsert: voluntarioProcedure
    .input(
      z.object({
        personId: uuidLike,
        locationId: uuidLike,
        programa: ProgramaSlug,
        metodo: MetodoEnum.default("qr_scan"),
        isDemoMode: z.boolean().default(false),
        clientId: uuidLike.optional(), // for idempotent offline sync
        /**
         * Raw scanned QR string (e.g. "bocatas://person/<uuid>?sig=<hmac8>").
         * When present, the server VERIFIES the HMAC signature before
         * processing. Absent → manual-search / anonymous / demo path (no sig
         * required — those flows never produce a signed payload).
         */
        qrValue: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // ── QR signature verification (when a raw QR string is supplied) ──────
      // This activates only when the QR-scan path passes qrValue.
      // Manual-search, anonymous, and demo paths omit qrValue → bypass.
      if (input.qrValue !== undefined) {
        const parsed = parseQrPayload(input.qrValue);
        if (!parsed) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Formato de QR inválido",
          });
        }
        // Ensure the UUID in the payload matches what the client claims.
        if (parsed.uuid.toLowerCase() !== input.personId.toLowerCase()) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "El QR no corresponde a la persona indicada",
          });
        }
        const secret = ENV.qrSigningSecret;
        if (!secret || secret.length < 32) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "QR signing secret not configured",
          });
        }
        const valid = await verifySig(parsed.uuid, parsed.sig, secret);
        if (!valid) {
          logProcedureAction(ctx, "Checkin: Invalid QR signature rejected", {
            personId: input.personId,
          });
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Firma del QR inválida o adulterada",
          });
        }
      }

      const supabase = createAdminClient();
      const startTime = Date.now();

      // 1. Verify person exists in persons_safe view
      const { data: person, error: personError } = await supabase
        .from("persons_safe")
        .select("id, restricciones_alimentarias")
        .eq("id", input.personId)
        .single();

      if (personError || !person) {
        logProcedureAction(ctx, 'Checkin: Person not found', {
          personId: input.personId,
          programa: input.programa,
        });
        return { status: "not_found" as const };
      }

      // ARG-01 / B.7: demo (practice) mode writes NO real data. Give realistic
      // feedback — the person was found, restrictions shown — but persist
      // nothing, so a demo check-in can never occupy a real check-in's unique
      // slot and block it. (Returns before the duplicate check + insert.)
      if (input.isDemoMode) {
        return {
          status: "registered" as const,
          restriccionesAlimentarias: person.restricciones_alimentarias ?? null,
        };
      }

      // 2. Check for duplicate (same person + location + programa + today)
      const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
      const { data: existing } = await supabase
        .from("attendances")
        .select("id, checked_in_at")
        .eq("person_id", input.personId)
        .eq("location_id", input.locationId)
        .eq("programa", input.programa)
        .eq("checked_in_date", today)
        .is("deleted_at", null)
        .maybeSingle();

      if (existing) {
        // Format time as HH:MM
        const time = new Date(existing.checked_in_at).toLocaleTimeString("es-ES", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Madrid",
        });
        logProcedureAction(ctx, 'Checkin: Duplicate entry', {
          personId: input.personId,
          programa: input.programa,
          lastCheckinTime: time,
        });
        return { status: "duplicate" as const, lastCheckinTime: time };
      }

      // 3. Insert attendance (only reached for real check-ins — demo returned
      // above, so es_demo is always false here).
      const { error: insertError } = await supabase.from("attendances").insert({
        person_id: input.personId,
        location_id: input.locationId,
        programa: input.programa,
        metodo: input.metodo,
        es_demo: false,
        // Authorship written server-side from the session, never the client
        // (#145). null only for the DEV_ADMIN_LOGIN synthetic user (not a real
        // auth.users row) — see authActorId.
        registrado_por: authActorId(ctx.user),
      });

      if (insertError) {
        // 23505 = unique_violation — race condition duplicate
        if (insertError.code === "23505") {
          const { data: race } = await supabase
            .from("attendances")
            .select("checked_in_at")
            .eq("person_id", input.personId)
            .eq("location_id", input.locationId)
            .eq("programa", input.programa)
            .eq("checked_in_date", today)
            .is("deleted_at", null)
            .maybeSingle();
          const time = race
            ? new Date(race.checked_in_at).toLocaleTimeString("es-ES", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Europe/Madrid",
              })
            : "--:--";
          logProcedureAction(ctx, 'Checkin: Race condition duplicate', {
            personId: input.personId,
            programa: input.programa,
          });
          return { status: "duplicate" as const, lastCheckinTime: time };
        }
        // 23503 = foreign_key_violation — slug not in the programs catalog
        // (deleted or mistyped program). Surface as a client error, not a 500.
        if (insertError.code === "23503") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Programa desconocido: no existe en el catálogo de programas",
          });
        }
        logProcedureError(ctx, 'Checkin: Failed to insert attendance', insertError as Error, {
          personId: input.personId,
          programa: input.programa,
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error al registrar asistencia: ${insertError.message}`,
        });
      }

      const duration = Date.now() - startTime;
      logProcedureAction(ctx, 'Checkin: Attendance registered', {
        personId: input.personId,
        programa: input.programa,
        metodo: input.metodo,
        duration,
      });

      return {
        status: "registered" as const,
        restriccionesAlimentarias: person.restricciones_alimentarias ?? null,
      };
    }),

  /**
   * anonymousCheckin — insert attendance with person_id = NULL.
   */
  anonymousCheckin: voluntarioProcedure
    .input(
      z.object({
        locationId: uuidLike,
        programa: ProgramaSlug,
        isDemoMode: z.boolean().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // ARG-01 / B.7: demo mode writes no real data.
      if (input.isDemoMode) {
        return { status: "registered" as const };
      }

      const supabase = createAdminClient();

      const { error } = await supabase.from("attendances").insert({
        person_id: null,
        location_id: input.locationId,
        programa: input.programa,
        metodo: "conteo_anonimo",
        es_demo: false,
        // The volunteer who registered the anonymous count (#145).
        registrado_por: authActorId(ctx.user),
      });

      if (error) {
        if (error.code === "23503") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Programa desconocido: no existe en el catálogo de programas",
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error al registrar asistencia anónima: ${error.message}`,
        });
      }

      return { status: "registered" as const };
    }),

  /**
   * searchPersons — manual-fallback search, accent- and word-order-
   * insensitive (RC-06): the normalised query is split into tokens and each
   * token becomes one AND'ed ilike against persons_safe.nombre_norm
   * (generated column, migration 20260830100001).
   */
  searchPersons: voluntarioProcedure
    .input(
      z.object({
        query: z.string().min(3).max(100),
      })
    )
    .query(async ({ input }) => {
      const tokens = nameSearchTokens(input.query);
      // '   ' passes min(3) but has no tokens — an unfiltered query would
      // return arbitrary rows.
      if (tokens.length === 0) return [];
      const supabase = createAdminClient();
      let q = supabase
        .from("persons_safe")
        .select("id, nombre, apellidos, fecha_nacimiento, foto_perfil_url, restricciones_alimentarias")
        .is("deleted_at", null);
      for (const tok of tokens) {
        q = q.ilike("nombre_norm", ilikeValue(tok));
      }
      const { data, error } = await q.limit(10);
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }
      const rows = (data ?? []).map((p) => ({ ...p, nombre: p.nombre ?? "", apellidos: p.apellidos ?? "" }));
      await signPathField(AVATAR_BUCKET, rows, "foto_perfil_url");
      return rows;
    }),

  /**
   * getLocations — list active locations.
   */
  getLocations: voluntarioProcedure.query(async () => {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("locations")
      .select("id, nombre, tipo")
      .eq("activo", true)
      .order("nombre");
    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    }
    return data ?? [];
  }),

  /**
   * getPrograms — list active programs for the program selector.
   */
  getPrograms: voluntarioProcedure.query(() => listActivePrograms(createAdminClient())),

  /**
   * syncOfflineQueue — idempotent batch insert for offline queue flush.
   *
   * Phase 6 QA-7A (F-005, CRITICAL): pre-fix this looped over `input` and
   * awaited one INSERT per item — 50–250ms hangs on a 10–50-item flush at
   * end-of-shift. Now: single `.upsert(..., { ignoreDuplicates: true })`
   * call. Latency ~1 round-trip regardless of batch size.
   *
   * 23505 unique-constraint violations are silently absorbed by
   * ignoreDuplicates. We mirror the old per-item return shape by
   * comparing each input's composite key against the rows the DB
   * actually inserted (returned in `data`).
   */
  syncOfflineQueue: voluntarioProcedure
    .input(
      z.array(
        z.object({
          clientId: uuidLike,
          personId: uuidLike.nullable(),
          locationId: uuidLike,
          programa: ProgramaSlug,
          metodo: MetodoEnum,
          isDemoMode: z.boolean().default(false),
          // ISO-8601 instant the check-in was captured ON THE DEVICE. Validated
          // here so the date/timestamp derivation below can't be fed garbage.
          queuedAt: z.string().datetime(),
        })
      )
    )
    .mutation(async ({ input, ctx }) => {
      if (input.length === 0) return [];
      const supabase = createAdminClient();

      // ARG-02: date/timestamp derived per item from queuedAt, not flush time.
      // ARG-01: demo items are filtered out of the rows (they write no real
      // data). Anonymous (person_id null) check-ins bypass the arbiter
      // (NULL <> NULL) → always insert. See checkin.offlineSync.ts.
      const enriched = enrichOfflineItems(input);
      const rows = offlineAttendanceRows(enriched, authActorId(ctx.user));

      // All-demo (or empty) batch → nothing to persist; everything reports
      // synced and leaves the queue without touching the DB.
      if (rows.length === 0) {
        return offlineSyncResults(enriched, new Set());
      }

      const { data, error } = await supabase
        .from("attendances")
        .upsert(rows, {
          onConflict: "person_id,location_id,programa,checked_in_date",
          ignoreDuplicates: true,
        })
        .select("person_id, location_id, programa, checked_in_date");

      if (error) {
        // Whole-batch failure — return all as error so the client can retry.
        // This payload is RETURNED (200), so the tRPC errorFormatter never sees
        // it: never embed the raw Postgres message (can carry PII) in `error`.
        // Return a generic Spanish string; log the raw error PII-safely to
        // stderr so ops can correlate the offline-sync failure.
        logCorrelatedErrorToStderr({ correlationId: ctx.correlationId, path: "checkin.syncOfflineQueue", type: "mutation", error });
        return input.map((item) => ({
          clientId: item.clientId,
          status: "error" as const,
          error: "No se pudo sincronizar el registro.",
        }));
      }

      // Build a key set of rows the DB actually inserted; anything missing
      // is a duplicate (or, for anonymous, was always going to insert).
      const insertedKeys = new Set(
        (data ?? []).map((r) =>
          `${r.person_id ?? "anon"}|${r.location_id}|${r.programa}|${r.checked_in_date}`
        )
      );
      return offlineSyncResults(enriched, insertedKeys);
    }),
});
