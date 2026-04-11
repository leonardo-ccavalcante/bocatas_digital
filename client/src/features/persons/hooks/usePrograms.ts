/**
 * usePrograms — tRPC-based programs hook.
 *
 * Previously used the Supabase browser client directly.
 * Now delegates to the tRPC server procedure that uses createAdminClient()
 * to ensure programs are always visible regardless of auth state.
 */
import { trpc } from "@/lib/trpc";
import { PROGRAMS_SEED_FALLBACK } from "../schemas";

export function usePrograms() {
  const query = trpc.persons.programs.useQuery(undefined, {
    staleTime: 5 * 60_000, // 5 min — programs change rarely
  });

  return {
    ...query,
    data: (query.data && query.data.length > 0) ? query.data : PROGRAMS_SEED_FALLBACK,
  };
}
