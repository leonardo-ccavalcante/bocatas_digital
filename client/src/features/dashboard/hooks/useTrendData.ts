/**
 * useTrendData — fetches weekly attendance for last 4 ISO weeks.
 * TanStack Query key: ['dashboard', 'trend', locationId]
 */
import { trpc } from "@/lib/trpc";

export function useTrendData(locationId: string, programa = "all") {
  return trpc.dashboard.getTrendData.useQuery(
    { locationId, programa },
    {
      staleTime: 60_000, // 1 min — Realtime will invalidate on new check-ins
      retry: 2,
    }
  );
}
