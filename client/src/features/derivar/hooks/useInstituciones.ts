/**
 * useInstituciones — TanStack Query hooks wrapping trpc.instituciones.search.
 *
 * Used by InstitucionTypeahead for real-time search as the user types.
 * Enabled only when q.length >= 2 and no item is already selected.
 */

import { trpc } from "@/lib/trpc";

export function useInstitucionSearch(q: string, enabled: boolean) {
  return trpc.instituciones.search.useQuery(
    { q, activeOnly: true },
    { enabled },
  );
}
