/**
 * usePersonById — tRPC-based person detail hook.
 *
 * Previously used the Supabase browser client directly, which failed because
 * Manus OAuth users have no Supabase JWT and RLS denied SELECT on persons.
 * Now delegates to the tRPC server procedure that uses createAdminClient().
 */
import { trpc } from "@/lib/trpc";

export function usePersonById(id: string | undefined) {
  return trpc.persons.getById.useQuery(
    { id: id! },
    {
      enabled: !!id,
      staleTime: 30_000,
      retry: false,
    }
  );
}
