/**
 * programs.sessions.ts — Session lifecycle procedures (cierre de sesión Wave 2).
 *
 * Wired as programs.sessions.* in the programsRouter.
 * All procedures use createAdminClient() (service role) per the app-wide
 * auth pattern (Manus OAuth, no Supabase JWT).
 *
 * Key rules (ADR-0007, ADR-0013):
 * - Do NOT use ON CONFLICT against the partial unique index uq_program_sessions_open.
 * - generarSesiones: SELECT-then-INSERT idempotency; never delete data-bearing sessions.
 * - v1 dedupe key: (program_id, fecha) — one session per day even if multiple slots.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, voluntarioProcedure, adminProcedure } from "../_core/trpc";
import { createAdminClient } from "../../client/src/lib/supabase/server";
import {
  ProgramacionSchema,
  type ProgramacionSlot,
} from "../../shared/sessionSchemas";
import { enforceCloseValidation } from "./programs.sessionClose";
import { assertProgramAccessForRole } from "./programs.access";

const uuidLike = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "UUID inválido");

/** Yields {fecha, slot} pairs for dates in [fechaInicio, fechaFin] matching programacion.
 * v1: if multiple slots match the same day, only the first is used (logged). */
function* iterateDateSlots(
  fechaInicio: string,
  fechaFin: string,
  slots: ProgramacionSlot[]
): Generator<{ fecha: string; slot: ProgramacionSlot }> {
  const end = new Date(fechaFin + "T00:00:00Z");
  for (
    const d = new Date(fechaInicio + "T00:00:00Z");
    d <= end;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const dayOfWeek = d.getUTCDay();
    const fecha = d.toISOString().split("T")[0];
    const matching = slots.filter((s) => s.dia_semana === dayOfWeek);
    if (matching.length > 1) {
      console.warn(
        `[generarSesiones] Múltiples slots el ${fecha} — solo se usará el primero (limitación v1).`
      );
    }
    if (matching.length > 0) {
      yield { fecha, slot: matching[0] };
    }
  }
}

export const sessionsRouter = router({
  /**
   * Materializes planned sessions from programs.config.programacion.
   * IDEMPOTENT: skips dates that already have a session.
   * v1 dedupe: (program_id, fecha) — one session per day.
   *
   * GROUP 1a: reads config.location_id (optional uuid) and stamps every
   * generated session so attendances.location_id NOT NULL can be satisfied.
   * GROUP 7c: throws BAD_REQUEST when programacion field is present but
   * fails ProgramacionSchema parse (absent/empty stays a no-op).
   */
  generarSesiones: adminProcedure
    .input(z.object({
      programId: uuidLike,
      desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }))
    .mutation(async ({ input }) => {
      const supabase = createAdminClient();
      const { data: program, error } = await supabase
        .from("programs")
        .select("id, slug, fecha_inicio, fecha_fin, config")
        .eq("id", input.programId)
        .single();
      if (error || !program) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Programa no encontrado" });
      }

      const fechaInicio = input.desde ?? program.fecha_inicio;
      const fechaFin = input.hasta ?? program.fecha_fin;
      if (!fechaInicio || !fechaFin) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "El programa no tiene fecha_inicio/fecha_fin. Proporciona desde y hasta.",
        });
      }

      const rawConfig = program.config as Record<string, unknown>;

      // GROUP 7c: treat present-but-invalid programacion as an error (not silent no-op)
      let slots: ProgramacionSlot[] = [];
      if (rawConfig?.programacion !== undefined && rawConfig.programacion !== null) {
        const parsed = ProgramacionSchema.safeParse(rawConfig.programacion);
        if (!parsed.success) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `programacion inválida: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
          });
        }
        slots = parsed.data;
      }

      // GROUP 1a + RESIDUAL 2: read optional location_id from config; validate UUID format
      const rawLocationId =
        typeof rawConfig?.location_id === "string" ? rawConfig.location_id : undefined;
      if (rawLocationId !== undefined) {
        // RESIDUAL 2: reject malformed UUID rather than silently stamping garbage
        const locationParsed = uuidLike.safeParse(rawLocationId);
        if (!locationParsed.success) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `config.location_id no es un UUID válido: "${rawLocationId}"`,
          });
        }
      }
      const configLocationId = rawLocationId;

      const { data: existing } = await supabase
        .from("program_sessions")
        .select("fecha")
        .eq("program_id", input.programId);
      const existingDates = new Set((existing ?? []).map((r) => r.fecha));

      let created = 0;
      let skipped = 0;
      for (const { fecha, slot } of iterateDateSlots(fechaInicio, fechaFin, slots)) {
        if (existingDates.has(fecha)) { skipped++; continue; }
        // RESIDUAL 2: surface insert error instead of silently counting it as created
        const { error: insertErr } = await supabase.from("program_sessions").insert({
          program_id: input.programId,
          fecha,
          estado: "planificada",
          hora_inicio: slot.hora_inicio,
          hora_fin: slot.hora_fin,
          ...(configLocationId ? { location_id: configLocationId } : {}),
        });
        if (insertErr) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Error al crear sesión para ${fecha}: ${insertErr.message}`,
          });
        }
        created++;
      }
      return { created, skipped };
    }),

  /**
   * planificada → abierta. Sets opened_by=null (Manus OAuth — no Supabase uid).
   *
   * GROUP 1b: accepts optional locationId so the responsible party can supply
   * the location at open time when it wasn't pre-set in config.
   * GROUP 3: throws FORBIDDEN for voluntarios on volunteer_can_access=false programs.
   *
   * RESIDUAL 2: resolves location from input → session → program.config in order.
   * If none resolves, throws BAD_REQUEST at OPEN time (signal at open, not at attendance).
   * This makes an abierta session ALWAYS have a location — dead-end is structurally blocked.
   */
  abrirSesion: voluntarioProcedure
    .input(z.object({
      sessionId: uuidLike,
      locationId: uuidLike.optional(),
      responsable_nombre: z.string().max(200).optional(),
      responsable_person_id: uuidLike.nullable().optional(),
      en_nombre_de: z.string().max(200).nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const supabase = createAdminClient();
      const { data: session, error } = await supabase
        .from("program_sessions")
        .select("id, estado, program_id, location_id")
        .eq("id", input.sessionId)
        .single();
      if (error || !session) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Sesión no encontrada" });
      }
      // GROUP 3: check volunteer_can_access before state transition
      await assertProgramAccessForRole(supabase, session.program_id, ctx.user);

      if (session.estado !== "planificada") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Solo se pueden abrir sesiones planificadas (estado actual: ${session.estado})`,
        });
      }

      // RESIDUAL 2: resolve location_id — input > session > program.config
      let resolvedLocationId: string | null = input.locationId ?? session.location_id ?? null;
      if (!resolvedLocationId) {
        const { data: prog } = await supabase.from("programs").select("config").eq("id", session.program_id).single();
        const cfg = prog?.config as Record<string, unknown> | null;
        resolvedLocationId = typeof cfg?.location_id === "string" ? cfg.location_id : null;
      }
      if (!resolvedLocationId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Selecciona una ubicación para abrir la sesión",
        });
      }

      await supabase.from("program_sessions").update({
        estado: "abierta",
        responsable_nombre: input.responsable_nombre ?? null,
        responsable_person_id: input.responsable_person_id ?? null,
        en_nombre_de: input.en_nombre_de ?? null,
        location_id: resolvedLocationId,
      }).eq("id", input.sessionId);
      return { success: true };
    }),

  /** abierta → cerrada. Validates session_data against the program's close config.
   * GROUP 3: throws FORBIDDEN for voluntarios on volunteer_can_access=false programs. */
  cerrarSesion: voluntarioProcedure
    .input(z.object({
      sessionId: uuidLike,
      session_data: z.record(z.string(), z.union([z.string(), z.number(), z.array(z.string()), z.null()])),
      en_nombre_de: z.string().max(200).nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const supabase = createAdminClient();
      const { data: session, error } = await supabase
        .from("program_sessions")
        .select("id, estado, program_id")
        .eq("id", input.sessionId)
        .single();
      if (error || !session) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Sesión no encontrada" });
      }
      // GROUP 3: check volunteer_can_access before proceeding
      await assertProgramAccessForRole(supabase, session.program_id, ctx.user);

      if (session.estado !== "abierta") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Solo se pueden cerrar sesiones abiertas (estado actual: ${session.estado})`,
        });
      }

      // Validate and whitelist via shared helper (GROUP 2 — identical path to enlaceCerrar)
      const sanitized = await enforceCloseValidation(
        supabase,
        session.program_id,
        input.sessionId,
        input.session_data as Record<string, unknown>
      );

      // RESIDUAL 4(d): add .eq("estado","abierta") so concurrent double-close is idempotent
      await supabase.from("program_sessions").update({
        estado: "cerrada",
        closed_at: new Date().toISOString(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        session_data: sanitized as any,
        en_nombre_de: input.en_nombre_de ?? null,
      }).eq("id", input.sessionId).eq("estado", "abierta");
      return { success: true };
    }),

  /** → cancelada. motivo is required. Exits the compliance denominator. */
  cancelarSesion: adminProcedure
    .input(z.object({
      sessionId: uuidLike,
      motivo: z.string().min(1, "motivo es obligatorio").max(500),
    }))
    .mutation(async ({ input }) => {
      if (!input.motivo.trim()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "El motivo de cancelación es obligatorio" });
      }
      const supabase = createAdminClient();
      const { data: session, error } = await supabase
        .from("program_sessions")
        .select("id, estado")
        .eq("id", input.sessionId)
        .single();
      if (error || !session) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Sesión no encontrada" });
      }
      if (session.estado === "cerrada" || session.estado === "cancelada") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `No se puede cancelar una sesión en estado: ${session.estado}`,
        });
      }
      await supabase.from("program_sessions").update({
        estado: "cancelada",
        motivo_cancelacion: input.motivo,
      }).eq("id", input.sessionId);
      return { success: true };
    }),

  /**
   * Moves a planificada session to a new fecha (and optionally new times).
   *
   * GROUP 7d: rejects if a session already exists on the target fecha for
   * this program; surfaces the Supabase update error instead of silently
   * returning success.
   */
  reprogramarSesion: adminProcedure
    .input(z.object({
      sessionId: uuidLike,
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      hora_inicio: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
      hora_fin: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
    }))
    .mutation(async ({ input }) => {
      const supabase = createAdminClient();
      const { data: session, error } = await supabase
        .from("program_sessions")
        .select("id, estado, program_id")
        .eq("id", input.sessionId)
        .single();
      if (error || !session) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Sesión no encontrada" });
      }
      if (session.estado !== "planificada") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Solo se pueden reprogramar sesiones en estado planificada",
        });
      }

      // GROUP 7d: pre-existence check — reject if target fecha already has a session
      const { data: conflicting } = await supabase
        .from("program_sessions")
        .select("id")
        .eq("program_id", session.program_id)
        .eq("fecha", input.fecha)
        .neq("id", input.sessionId)
        .maybeSingle();
      if (conflicting) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Ya existe una sesión para este programa el ${input.fecha}`,
        });
      }

      const { error: updateError } = await supabase.from("program_sessions").update({
        fecha: input.fecha,
        ...(input.hora_inicio ? { hora_inicio: input.hora_inicio } : {}),
        ...(input.hora_fin ? { hora_fin: input.hora_fin } : {}),
      }).eq("id", input.sessionId);
      if (updateError) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: updateError.message });
      }
      return { success: true };
    }),

  /**
   * Calendar feed for the edition tab. Optional year+month filter.
   * GROUP 3: throws FORBIDDEN for voluntarios on volunteer_can_access=false programs.
   */
  listSesiones: voluntarioProcedure
    .input(z.object({
      programId: uuidLike,
      year: z.number().int().min(2020).max(2100).optional(),
      month: z.number().int().min(1).max(12).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const supabase = createAdminClient();

      // GROUP 3: check volunteer_can_access before returning session data
      await assertProgramAccessForRole(supabase, input.programId, ctx.user);

      let query = supabase
        .from("program_sessions")
        .select("id, fecha, estado, hora_inicio, hora_fin, responsable_nombre, session_data, motivo_cancelacion, closed_at")
        .eq("program_id", input.programId)
        .order("fecha");

      if (input.year && input.month) {
        const mm = String(input.month).padStart(2, "0");
        const lastDay = new Date(Date.UTC(input.year, input.month, 0)).getUTCDate();
        query = query
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .gte("fecha" as any, `${input.year}-${mm}-01`)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .lte("fecha" as any, `${input.year}-${mm}-${String(lastDay).padStart(2, "0")}`);
      }

      const { data, error } = await query;
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data ?? [];
    }),
});
