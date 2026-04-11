import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { z } from "zod";

const PersonSearchResultSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string(),
  apellidos: z.string().nullable(),
  fecha_nacimiento: z.string().nullable(),
  foto_perfil_url: z.string().nullable(),
  restricciones_alimentarias: z.string().nullable(),
  fase_itinerario: z.string().nullable(),
});

export type PersonSearchResult = z.infer<typeof PersonSearchResultSchema>;

export function useSearchPersons(query: string) {
  const supabase = createClient();
  const trimmed = query.trim();

  return useQuery<PersonSearchResult[]>({
    queryKey: ["persons", "search", trimmed],
    enabled: trimmed.length >= 2,
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("persons")
        .select("id, nombre, apellidos, fecha_nacimiento, foto_perfil_url, restricciones_alimentarias, fase_itinerario")
        .or(`nombre.ilike.%${trimmed}%,apellidos.ilike.%${trimmed}%`)
        .is("deleted_at", null)
        .order("nombre")
        .limit(20);

      if (error) throw error;
      return z.array(PersonSearchResultSchema).parse(data ?? []);
    },
  });
}
