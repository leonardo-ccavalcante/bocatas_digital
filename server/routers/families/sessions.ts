import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { uuidLike, programIdSchema } from "./_shared";

/**
 * MYT-136B (gh #136 item 2): `uq_program_sessions_open`
 * (supabase/migrations/20260413121654_..._create_program_sessions.sql:18-20) is a
 * PARTIAL unique index — `WHERE closed_at IS NULL` — so Postgres only evaluates it
 * for rows that are themselves open. closeSession always inserts a row that is
 * ALREADY closed (`closed_at` set at insert time, L below), so it never
 * participates in that index and the constraint can never reject a duplicate
 * closed row for the same (program_id, fecha, location_id). A DB-level total
 * constraint would close this properly, but adding one requires auditing prod for
 * preexisting duplicates first (no agent DB access) — see the issue. Dedupe is
 * therefore enforced with the house SELECT-then-INSERT pattern instead (mirrors
 * server/routers/programs.sessions.ts ADR-0007/0013 and
 * server/routers/families/rounds-closeout.ts / rounds-signature.ts): a pre-insert
 * read for an existing closed row is a real DB check, so — unlike a process-local
 * cache — it also holds across concurrent requests, replicas, and restarts.
 */
export const sessionsRouter = router({
  // ─── Job 10: Session Close ───────────────────────────────────────────────
  /** POST close a program session */
  closeSession: adminProcedure
    .input(
      z.object({
        program_id: programIdSchema,
        fecha: z.string(),
        location_id: uuidLike.optional(),
        session_data: z.record(z.string(), z.unknown()),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();

      // Pre-insert existence check: see the header comment for why the partial
      // unique index can never catch a duplicate already-closed insert.
      let existingQuery = db
        .from("program_sessions")
        .select("*")
        .eq("program_id", input.program_id)
        .eq("fecha", input.fecha)
        .not("closed_at", "is", null);
      existingQuery = input.location_id
        ? existingQuery.eq("location_id", input.location_id)
        : existingQuery.is("location_id", null);
      const { data: existingClosed } = await existingQuery.maybeSingle();
      if (existingClosed) return existingClosed;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sessionInsert: any = {
        program_id: input.program_id,
        fecha: input.fecha,
        location_id: input.location_id ?? null,
        opened_by: ctx.user.id,
        closed_by: ctx.user.id,
        session_data: input.session_data,
        closed_at: new Date().toISOString(),
      };
      const { data, error } = await db.from("program_sessions").insert(sessionInsert).select().single();

      if (error) {
        // Only reachable for a genuine concurrent duplicate OPEN row (the
        // partial index's real predicate) — see the header comment for why this
        // can never catch a duplicate CLOSED row; the pre-insert select above is
        // the defense for that case.
        if (error.code === "23505") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Ya existe una sesión cerrada para este programa hoy en esta sede",
          });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }
      return data;
    }),

  /** GET open session for a program today */
  getOpenSession: adminProcedure
    .input(
      z.object({
        program_id: programIdSchema,
        fecha: z.string().optional(),
        location_id: uuidLike.optional(),
      })
    )
    .query(async ({ input }) => {
      const db = createAdminClient();
      const fecha = input.fecha ?? new Date().toISOString().split("T")[0];
      const { data } = await db
        .from("program_sessions")
        .select("*")
        .eq("program_id", input.program_id)
        .eq("fecha", fecha)
        .is("closed_at", null)
        .maybeSingle();
      return data ?? null;
    }),
});
