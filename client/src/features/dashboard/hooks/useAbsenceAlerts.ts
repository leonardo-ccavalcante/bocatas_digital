/**
 * useAbsenceAlerts — Real implementation (replaces Gate 2 stub).
 *
 * Fetches persons who have not checked in for >= thresholdDays.
 * Uses tRPC dashboard.getAbsenceAlerts with location + program filters.
 * Refreshes every 5 minutes automatically.
 */
import { trpc } from "@/lib/trpc";

export interface AbsenceAlert {
  personId: string;
  nombre: string;
  apellidos: string;
  diasAusente: number;
  ultimoCheckin: string;
  restriccionesAlimentarias: string | null;
}

interface UseAbsenceAlertsOptions {
  locationId?: string;
  programa?: string;
  thresholdDays?: number;
  enabled?: boolean;
}

export function useAbsenceAlerts({
  locationId = "all",
  programa = "all",
  thresholdDays = 14,
  enabled = true,
}: UseAbsenceAlertsOptions = {}) {
  const query = trpc.dashboard.getAbsenceAlerts.useQuery(
    { locationId, programa, thresholdDays },
    {
      enabled,
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchInterval: 5 * 60 * 1000, // auto-refresh every 5 minutes
      retry: 2,
    }
  );

  return {
    data: (query.data ?? []) as AbsenceAlert[],
    count: (query.data ?? []).length,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
