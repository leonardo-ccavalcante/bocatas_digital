import { trpc } from "@/lib/trpc";

/**
 * Returns active programs for the current user.
 * Voluntarios only see programs with volunteer_can_access=true.
 */
export function usePrograms() {
  const { data, isLoading, error } = trpc.programs.getAll.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    programs: data ?? [],
    isLoading,
    error,
  };
}

/**
 * Returns all programs with enrollment counts (admin only).
 */
export function useProgramsWithCounts() {
  const { data, isLoading, error, refetch } = trpc.programs.getAllWithCounts.useQuery(undefined, {
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  return {
    programs: data ?? [],
    isLoading,
    error,
    refetch,
  };
}
