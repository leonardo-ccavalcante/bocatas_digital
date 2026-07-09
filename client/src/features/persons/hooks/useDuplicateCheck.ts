/**
 * useDuplicateCheck — hook that checks for potential duplicate persons.
 *
 * ARCHITECTURE NOTE (2026-06-14):
 * The find_duplicate_persons Supabase RPC has EXECUTE revoked from PUBLIC and
 * authenticated (migration 20260506000007). The anon key (used by the browser
 * Supabase client) inherits from PUBLIC → 401 Unauthorized.
 *
 * Fix: call trpc.persons.findDuplicates instead of supabase.rpc directly.
 * The tRPC procedure runs server-side with createAdminClient (service_role),
 * which retains EXECUTE on the function.
 *
 * The ilike fallback is also removed: it was only needed to recover from the
 * 401. The tRPC procedure handles errors with TRPCError, which React Query
 * surfaces normally. If the procedure fails, we return [] (graceful degradation)
 * to avoid blocking the registration wizard.
 */
import { trpc } from "@/lib/trpc";
import type { DuplicateCandidate } from "../schemas";

const SIMILARITY_THRESHOLD = 0.70;

export function useDuplicateCheck(
  nombre: string,
  apellidos: string,
  enabled = true
) {
  const fullName = `${nombre.trim()} ${apellidos.trim()}`.trim();

  const query = trpc.persons.findDuplicates.useQuery(
    {
      nombre: nombre.trim(),
      apellidos: apellidos.trim(),
      threshold: SIMILARITY_THRESHOLD,
    },
    {
      enabled: enabled && fullName.length >= 4,
      staleTime: 30_000,
      // Graceful degradation: if the procedure fails, return empty array
      // so the registration wizard is not blocked.
      retry: false,
    }
  );

  return {
    ...query,
    data: (query.data ?? []) as DuplicateCandidate[],
  };
}
