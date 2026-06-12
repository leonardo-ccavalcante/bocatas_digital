/**
 * OfflinePendingBadge.tsx — Shows the state of the offline check-in queue.
 *
 * Three states (in priority order):
 *   - Syncing — a flush is in progress.
 *   - Failed (POS-03) — some queued check-ins did NOT sync (server error or a
 *     whole-batch failure). Surfaced in amber so the volunteer knows they need
 *     attention, instead of looking like ordinary pending-offline items.
 *   - Pending — items waiting for connectivity.
 */
import { WifiOff, Loader2, AlertTriangle } from "lucide-react";

interface OfflinePendingBadgeProps {
  count: number;
  failedCount: number;
  isSyncing: boolean;
}

export function OfflinePendingBadge({ count, failedCount, isSyncing }: OfflinePendingBadgeProps) {
  if (count === 0 && failedCount === 0 && !isSyncing) return null;

  // Failed items take precedence once syncing settles — they need attention.
  if (failedCount > 0 && !isSyncing) {
    return (
      <div
        role="status"
        className="flex items-center gap-1.5 rounded-full bg-amber-100 border border-amber-400 px-3 py-1"
      >
        <AlertTriangle className="w-3.5 h-3.5 text-amber-700" aria-hidden="true" />
        <span className="text-xs font-medium text-amber-800">
          {failedCount} sin sincronizar
        </span>
      </div>
    );
  }

  const pendingCount = Math.max(0, count - failedCount);
  if (pendingCount === 0 && !isSyncing) return null;

  return (
    <div
      role="status"
      className="flex items-center gap-1.5 rounded-full bg-slate-100 border border-slate-300 px-3 py-1"
    >
      {isSyncing ? (
        <Loader2 className="w-3.5 h-3.5 text-slate-600 animate-spin" aria-hidden="true" />
      ) : (
        <WifiOff className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />
      )}
      <span className="text-xs font-medium text-slate-700">
        {isSyncing
          ? "Sincronizando..."
          : `${pendingCount} pendiente${pendingCount !== 1 ? "s" : ""} sin conexión`}
      </span>
    </div>
  );
}
