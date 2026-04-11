import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { ProgramSchema, PROGRAMS_SEED_FALLBACK, type Program } from "../schemas";
import { z } from "zod";

export function usePrograms() {
  const supabase = createClient();

  return useQuery<Program[]>({
    queryKey: ["programs"],
    staleTime: 5 * 60_000, // 5 min — programs change rarely
    queryFn: async () => {
      const { data, error } = await supabase
        .from("programs")
        .select("id, slug, name, description, icon, is_default, is_active, display_order")
        .eq("is_active", true)
        .order("display_order");

      if (error) {
        // Graceful fallback to seed data
        console.warn("[usePrograms] DB error, using fallback:", error.message);
        return PROGRAMS_SEED_FALLBACK;
      }

      const parsed = z.array(ProgramSchema).safeParse(data ?? []);
      if (!parsed.success) return PROGRAMS_SEED_FALLBACK;

      return parsed.data.length > 0 ? parsed.data : PROGRAMS_SEED_FALLBACK;
    },
  });
}
