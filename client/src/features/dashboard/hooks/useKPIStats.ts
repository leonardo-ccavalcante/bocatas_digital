/**
 * useKPIStats — fetches attendance count for a given period and location.
 * TanStack Query key: ['dashboard', 'kpi', period, locationId]
 */
import { trpc } from "@/lib/trpc";
import type { Period } from "../schemas";

export function useKPIStats(period: Period, locationId: string, programa = "all") {
  return trpc.dashboard.getKPIStats.useQuery(
    { period, locationId, programa },
    {
      staleTime: 30_000, // 30s — Realtime will invalidate on new check-ins
      retry: 2,
    }
  );
}
