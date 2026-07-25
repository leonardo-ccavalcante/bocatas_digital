/**
 * programs.closeConfig.ts — Close configuration management for program sessions.
 *
 * Wired as programs.closeConfig.* in the programsRouter.
 * The session_close_config JSONB column on programs stores a SessionCloseConfig.
 * This router provides read + update + preset-apply for that config.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, voluntarioProcedure, adminProcedure } from "../_core/trpc";
import { createAdminClient } from "../../client/src/lib/supabase/server";
import {
  SessionCloseConfigSchema,
  CLOSE_CONFIG_PRESETS,
} from "../../shared/sessionSchemas";
import { TIPOS_PROGRAMA } from "../../shared/programEstados";
import type { Database } from "../../client/src/lib/database.types";
import { assertProgramAccessForRole } from "./programs.access";

type ProgramUpdate = Database["public"]["Tables"]["programs"]["Update"];

const uuidLike = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "UUID inválido");

export const closeConfigRouter = router({
  /**
   * Returns the session_close_config for a program. Falls back to DB default if null.
   * RESIDUAL 1(b): assertProgramAccessForRole added so voluntarios cannot read
   * the close config for volunteer_can_access=false programs.
   */
  getCloseConfig: voluntarioProcedure
    .input(z.object({ programId: uuidLike }))
    .query(async ({ input, ctx }) => {
      const supabase = createAdminClient();
      // RESIDUAL 1(b): check volunteer_can_access before returning config
      await assertProgramAccessForRole(supabase, input.programId, ctx.user);
      const { data: program, error } = await supabase
        .from("programs")
        .select("id, slug, session_close_config")
        .eq("id", input.programId)
        .single();
      if (error || !program) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Programa no encontrado" });
      }
      const parsed = SessionCloseConfigSchema.safeParse(
        program.session_close_config ?? { enabled: false, fields: [], uploads: [] }
      );
      return parsed.success
        ? parsed.data
        : { enabled: false as const, fields: [], uploads: [], tema_obligatorio: false };
    }),

  /** Validates and persists a SessionCloseConfig for a program (admin+). */
  updateCloseConfig: adminProcedure
    .input(z.object({
      programId: uuidLike,
      config: SessionCloseConfigSchema,
    }))
    .mutation(async ({ input }) => {
      const validated = SessionCloseConfigSchema.safeParse(input.config);
      if (!validated.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Configuración inválida: ${validated.error.issues.map((i) => i.message).join("; ")}`,
        });
      }
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from("programs")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ session_close_config: validated.data as ProgramUpdate["session_close_config"] as any })
        .eq("id", input.programId)
        .select("id")
        .single();
      if (error || !data) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Programa no encontrado o sin cambios" });
      }
      return { success: true, config: validated.data };
    }),

  /** Applies the canonical preset for a program tipo (admin+).
   * See shared/sessionSchemas.ts CLOSE_CONFIG_PRESETS for each tipo's defaults. */
  applyPreset: adminProcedure
    .input(z.object({
      programId: uuidLike,
      tipo: z.enum(TIPOS_PROGRAMA),
    }))
    .mutation(async ({ input }) => {
      const preset = CLOSE_CONFIG_PRESETS[input.tipo];
      if (!preset) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `No hay preset definido para el tipo '${input.tipo}'`,
        });
      }
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from("programs")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ session_close_config: preset as ProgramUpdate["session_close_config"] as any })
        .eq("id", input.programId)
        .select("id")
        .single();
      if (error || !data) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Programa no encontrado" });
      }
      return { success: true, config: preset };
    }),
});
