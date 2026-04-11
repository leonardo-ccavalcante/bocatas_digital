import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

interface EnrollPersonParams {
  personId: string;
  programIds: string[];
}

export function useEnrollPerson() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ personId, programIds }: EnrollPersonParams) => {
      if (programIds.length === 0) return [];

      // Upsert enrollments — one row per program
      const rows = programIds.map((programId) => ({
        person_id: personId,
        program_id: programId,
        estado: "activo" as const,
      }));

      const { data, error } = await supabase
        .from("program_enrollments")
        .upsert(rows, { onConflict: "person_id,program_id" })
        .select("id, program_id, estado");

      if (error) throw error;
      return data ?? [];
    },
    onSuccess: (_data, { personId }) => {
      void queryClient.invalidateQueries({ queryKey: ["persons", personId] });
      void queryClient.invalidateQueries({ queryKey: ["enrollments", personId] });
    },
  });
}
