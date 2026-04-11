import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { PersonSchema, type Person } from "../schemas";

export function usePersonById(id: string | undefined) {
  const supabase = createClient();

  return useQuery<Person | null>({
    queryKey: ["persons", id],
    enabled: !!id,
    staleTime: 30_000,
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("persons")
        .select("*")
        .eq("id", id)
        .is("deleted_at", null)
        .single();

      if (error) throw error;
      return PersonSchema.parse(data);
    },
  });
}
