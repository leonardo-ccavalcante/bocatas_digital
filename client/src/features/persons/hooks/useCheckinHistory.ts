/**
 * useCheckinHistory — paginated check-in history for a person.
 * Calls tRPC persons.getCheckinHistory with pagination support.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";

export interface CheckinHistoryRow {
  id: string;
  fecha: string;
  hora: string;
  sede: string;
  programa: string;
  metodo: string;
  esDemo: boolean;
  notas: string | null;
}

const PAGE_SIZE = 20;

export function useCheckinHistory(personId: string) {
  const [offset, setOffset] = useState(0);

  const query = trpc.persons.getCheckinHistory.useQuery(
    { personId, limit: PAGE_SIZE, offset },
    {
      enabled: !!personId && personId.length > 0,
      staleTime: 60 * 1000, // 1 minute
    }
  );

  const rows = (query.data?.rows ?? []) as CheckinHistoryRow[];
  const total = query.data?.total ?? 0;
  const hasMore = query.data?.hasMore ?? false;

  function nextPage() {
    if (hasMore) setOffset((o) => o + PAGE_SIZE);
  }

  function prevPage() {
    if (offset > 0) setOffset((o) => Math.max(0, o - PAGE_SIZE));
  }

  return {
    rows,
    total,
    hasMore,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    offset,
    pageSize: PAGE_SIZE,
    currentPage: Math.floor(offset / PAGE_SIZE) + 1,
    totalPages: Math.ceil(total / PAGE_SIZE),
    nextPage,
    prevPage,
    refetch: query.refetch,
  };
}
