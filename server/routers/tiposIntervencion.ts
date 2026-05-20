import { TRPCError } from "@trpc/server";

import { createAdminClient } from "../../client/src/lib/supabase/server";
import { router, adminProcedure } from "../_core/trpc";

/**
 * tiposIntervencion — read-only catalog of intervention categories for the
 * Derivar flow. Seeded in migration 20260603000002; superadmin-editable in the
 * DB. The Derivar "+ Nueva intervención" form uses this for its tipo picker.
 */
export const tiposIntervencionRouter = router({
  list: adminProcedure.query(async () => {
    const db = createAdminClient();
    const { data, error } = await db
      .from("tipos_intervencion")
      .select("id, slug, nombre, display_order, is_active")
      .eq("is_active", true)
      .order("display_order", { ascending: true });
    if (error) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    }
    return data ?? [];
  }),
});
