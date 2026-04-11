/**
 * useSearchPersons — tRPC-based person search hook.
 *
 * Previously used the Supabase browser client directly, which failed because
 * Manus OAuth users have no Supabase JWT and RLS denied SELECT on persons.
 * Now delegates to the tRPC server procedure that uses createAdminClient().
 */
import { trpc } from "@/lib/trpc";

export type PersonSearchResult = {
  id: string;
  nombre: string;
  apellidos: string | null;
  fecha_nacimiento: string | null;
  foto_perfil_url: string | null;
  restricciones_alimentarias: string | null;
  fase_itinerario: string | null;
};

export function useSearchPersons(query: string) {
  const trimmed = query.trim();
  return trpc.persons.search.useQuery(
    { query: trimmed },
    {
      enabled: trimmed.length >= 2,
      staleTime: 10_000,
    }
  );
}
