/**
 * checkin.ts — tRPC router for QR Check-in (Epic B).
 *
 * Uses createAdminClient() (service role key) to bypass RLS since the app
 * uses Manus OAuth — users have no Supabase JWT.
 * Authorization enforced at tRPC layer via protectedProcedure.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createAdminClient } from "../../client/src/lib/supabase/server";
import { protectedProcedure, router } from "../_core/trpc";
import { logProcedureAction, logProcedureError } from "../_core/logging-middleware";

// UUID-like validator that accepts any 8-4-4-4-12 hex string (including synthetic seed IDs)
const uuidLike = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "Invalid UUID format"
);

// ─── Enums matching DB types ──────────────────────────────────────────────────
const ProgramaEnum = z.enum([
  "comedor",
  "familia",
  "formacion",
  "atencion_juridica",
  "voluntariado",
  "acompanamiento",
]);

const MetodoEnum = z.enum(["qr_scan", "manual_busqueda", "conteo_anonimo"]);

// ─── Router ───────────────────────────────────────────────────────────────────
export const checkinRouter = router({
  /**
   * verifyAndInsert — verify person exists, insert attendance, return result.
   * Returns:
   *   { status: 'registered', restriccionesAlimentarias: string | null }
   *   { status: 'duplicate', lastCheckinTime: string }
   *   { status: 'not_found' }
   */
  verifyAndInsert: protectedProcedure
    .input(
      z.object({
        personId: uuidLike,
        locationId: uuidLike,
        programa: ProgramaEnum,
        metodo: MetodoEnum.default("qr_scan"),
        isDemoMode: z.boolean().default(false),
        clientId: uuidLike.optional(), // for idempotent offline sync
      })
    )
    .mutation(async ({ ctx, input }) => {
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

      // 3. Insert attendance
      const { error: insertError } = await supabase.from("attendances").insert({
        person_id: input.personId,
        location_id: input.locationId,
        programa: input.programa,
        metodo: input.metodo,
        es_demo: input.isDemoMode,
        // registrado_por: null (no Supabase auth.uid() available with Manus OAuth)
        // The RLS is bypassed via service role key
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
  anonymousCheckin: protectedProcedure
    .input(
      z.object({
        locationId: uuidLike,
        programa: ProgramaEnum,
        isDemoMode: z.boolean().default(false),
      })
    )
    .mutation(async ({ input }) => {
      const supabase = createAdminClient();

      const { error } = await supabase.from("attendances").insert({
        person_id: null,
        location_id: input.locationId,
        programa: input.programa,
        metodo: "conteo_anonimo",
        es_demo: input.isDemoMode,
      });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error al registrar asistencia anónima: ${error.message}`,
        });
      }

      return { status: "registered" as const };
    }),

  /**
   * searchPersons — fuzzy search by nombre/apellidos for manual fallback.
   */
  searchPersons: protectedProcedure
    .input(
      z.object({
        query: z.string().min(3).max(100),
      })
    )
    .query(async ({ input }) => {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from("persons_safe")
        .select("id, nombre, apellidos, fecha_nacimiento, foto_perfil_url, restricciones_alimentarias")
        .or(
          `nombre.ilike.%${input.query}%,apellidos.ilike.%${input.query}%`
        )
        .is("deleted_at", null)
        .limit(10);
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }
      return (data ?? []).map((p) => ({
        ...p,
        nombre: p.nombre ?? "",
        apellidos: p.apellidos ?? "",
      }));
    }),

  /**
   * getLocations — list active locations.
   */
  getLocations: protectedProcedure.query(async () => {
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
  getPrograms: protectedProcedure.query(async () => {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("programs")
      .select("id, slug, name, icon, is_default")
      .eq("is_active", true)
      .order("display_order");
    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    }
    return data ?? [];
  }),

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
  syncOfflineQueue: protectedProcedure
    .input(
      z.array(
        z.object({
          clientId: uuidLike,
          personId: uuidLike.nullable(),
          locationId: uuidLike,
          programa: ProgramaEnum,
          metodo: MetodoEnum,
          isDemoMode: z.boolean().default(false),
          queuedAt: z.string(),
        })
      )
    )
    .mutation(async ({ input }) => {
      if (input.length === 0) return [];
      const supabase = createAdminClient();

      // Pin the date server-side so the result-mapping key matches what
      // the unique constraint sees. Anonymous (person_id null) check-ins
      // bypass the partial unique index → always insert (no key collision).
      const today = new Date().toISOString().slice(0, 10);
      const rows = input.map((item) => ({
        person_id: item.personId,
        location_id: item.locationId,
        programa: item.programa,
        metodo: item.metodo,
        es_demo: item.isDemoMode,
        checked_in_date: today,
      }));

      const { data, error } = await supabase
        .from("attendances")
        .upsert(rows, {
          onConflict: "person_id,location_id,programa,checked_in_date",
          ignoreDuplicates: true,
        })
        .select("person_id, location_id, programa, checked_in_date");

      if (error) {
        // Whole-batch failure — return all as error so the client can retry.
        return input.map((item) => ({
          clientId: item.clientId,
          status: "error" as const,
          error: error.message,
        }));
      }

      // Build a key set of rows the DB actually inserted; anything missing
      // is a duplicate (or, for anonymous, was always going to insert).
      const insertedKeys = new Set(
        (data ?? []).map((r) =>
          `${r.person_id ?? "anon"}|${r.location_id}|${r.programa}|${r.checked_in_date}`
        )
      );
      // For anonymous rows the unique constraint doesn't apply, so every
      // anonymous input is "synced" by definition. For non-anon, status is
      // derived from membership in insertedKeys.
      return input.map((item) => {
        if (item.personId === null) {
          return { clientId: item.clientId, status: "synced" as const };
        }
        const key = `${item.personId}|${item.locationId}|${item.programa}|${today}`;
        return {
          clientId: item.clientId,
          status: insertedKeys.has(key) ? ("synced" as const) : ("duplicate" as const),
        };
      });
    }),
});
