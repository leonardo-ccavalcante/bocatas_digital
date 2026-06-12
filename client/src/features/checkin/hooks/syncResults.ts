/**
 * syncResults.ts — categorize the per-item results of a syncOfflineQueue flush.
 *
 * POS-03: the flush returns one result per queued item with status
 * "synced" | "duplicate" | "error". synced/duplicate are settled (dequeue);
 * "error" items must be tracked as FAILED (surfaced to the volunteer) rather
 * than silently left in the queue looking like ordinary pending-offline items.
 */
export type SyncResultStatus = "synced" | "duplicate" | "error";

export interface SyncResult {
  clientId: string;
  status: SyncResultStatus;
}

/**
 * Split flush results into the clientIds to dequeue (settled) and the clientIds
 * that failed this attempt (to surface + retry later).
 */
export function categorizeSyncResults(results: SyncResult[]): {
  settled: string[];
  failed: string[];
} {
  const settled: string[] = [];
  const failed: string[] = [];
  for (const r of results) {
    if (r.status === "error") {
      failed.push(r.clientId);
    } else {
      settled.push(r.clientId);
    }
  }
  return { settled, failed };
}
