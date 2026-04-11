import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { DuplicateCandidateSchema, type DuplicateCandidate } from "../schemas";
import { z } from "zod";

const SIMILARITY_THRESHOLD = 0.70;

export function useDuplicateCheck(
  nombre: string,
  apellidos: string,
  enabled = true
) {
  const supabase = createClient();
  const fullName = `${nombre.trim()} ${apellidos.trim()}`.trim();

  return useQuery<DuplicateCandidate[]>({
    queryKey: ["persons", "duplicates", fullName],
    enabled: enabled && fullName.length >= 4,
    staleTime: 30_000,
    queryFn: async () => {
      // Use pg_trgm RPC (find_duplicate_persons is in generated types)
      const { data, error } = await supabase.rpc("find_duplicate_persons", {
        p_nombre: nombre.trim(),
        p_apellidos: apellidos.trim(),
        p_threshold: SIMILARITY_THRESHOLD,
      });

      if (error) {
        // Graceful fallback: ilike search
        const { data: fallback, error: fallbackError } = await supabase
          .from("persons")
          .select("id, nombre, apellidos, fecha_nacimiento, foto_perfil_url")
          .or(`nombre.ilike.%${nombre.trim()}%,apellidos.ilike.%${apellidos.trim()}%`)
          .is("deleted_at", null)
          .limit(5);

        if (fallbackError) return [];

        return z.array(DuplicateCandidateSchema).parse(
          (fallback ?? []).map((p) => ({ ...p, similarity: 0.75 }))
        );
      }

      return z.array(DuplicateCandidateSchema).parse(data ?? []);
    },
  });
}
