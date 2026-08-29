/**
 * useDuplicateCheck — hook that checks for potential duplicate persons.
 *
 * Calls trpc.persons.findDuplicates (server-side, createAdminClient =
 * service_role) because the find_duplicate_persons RPC has EXECUTE revoked
 * from PUBLIC/authenticated/anon (migrations 20260506000007, 20260613000001).
 * service_role's own EXECUTE is granted explicitly in 20260830100000 — it was
 * never implicit (RC-02).
 *
 * Graceful degradation is EXPLICIT, never silent: on error `data` stays []
 * so the registration wizard is not blocked, and `isDegraded` is true so the
 * phase-1 step renders a non-blocking notice telling the volunteer the
 * duplicate check did not run (see Step1Identidad).
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
      retry: false,
    }
  );

  return {
    ...query,
    data: (query.data ?? []) as DuplicateCandidate[],
    isDegraded: query.isError,
  };
}
