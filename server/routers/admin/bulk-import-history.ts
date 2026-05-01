import { z } from "zod";
import { adminProcedure } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";

export const bulkImportHistoryRouter = {
  /**
   * Get bulk import history with pagination
   */
  getBulkImportHistory: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input, ctx }) => {
      const supabase = createAdminClient();

      const { data, error } = await supabase
        .from("bulk_import_history")
        .select()
        .order("created_at", { ascending: false })
        .range(input.offset, input.offset + input.limit - 1);

      if (error) throw new Error(`Failed to fetch import history: ${error.message}`);
      return data || [];
    }),

  /**
   * Record the start of a bulk import
   */
  recordImportStart: adminProcedure
    .input(
      z.object({
        total_rows: z.number().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const supabase = createAdminClient();

      const { data, error } = await supabase
        .from("bulk_import_history")
        .insert({
          created_by: ctx.user.openId,
          status: "pending",
          total_rows: input.total_rows,
          successful_rows: 0,
          failed_rows: 0,
        })
        .select()
        .single();

      if (error) throw new Error(`Failed to record import start: ${error.message}`);
      return data;
    }),

  /**
   * Record successful completion of a bulk import
   */
  recordImportComplete: adminProcedure
    .input(
      z.object({
        import_id: z.string().uuid(),
        successful_rows: z.number().min(0),
        failed_rows: z.number().min(0),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const supabase = createAdminClient();

      const { data, error } = await supabase
        .from("bulk_import_history")
        .update({
          status: "completed",
          successful_rows: input.successful_rows,
          failed_rows: input.failed_rows,
          completed_at: new Date().toISOString(),
        })
        .eq("id", input.import_id)
        .eq("created_by", ctx.user.openId)
        .select()
        .single();

      if (error) throw new Error(`Failed to record import completion: ${error.message}`);
      return data;
    }),

  /**
   * Record failure of a bulk import
   */
  recordImportFailure: adminProcedure
    .input(
      z.object({
        import_id: z.string().uuid(),
        error_message: z.string(),
        successful_rows: z.number().min(0).optional(),
        failed_rows: z.number().min(0).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const supabase = createAdminClient();

      const { data, error } = await supabase
        .from("bulk_import_history")
        .update({
          status: "failed",
          error_message: input.error_message,
          successful_rows: input.successful_rows || 0,
          failed_rows: input.failed_rows || 0,
          completed_at: new Date().toISOString(),
        })
        .eq("id", input.import_id)
        .eq("created_by", ctx.user.openId)
        .select()
        .single();

      if (error) throw new Error(`Failed to record import failure: ${error.message}`);
      return data;
    }),
};
