/**
 * OfflinePendingBadge.tsx — Shows the state of the offline check-in queue.
 *
 *   - Syncing — a flush is in progress.
 *   - Failed (POS-03) — queued check-ins that did NOT sync (server error or a
 *     whole-batch failure), surfaced in amber so the volunteer knows they need
 *     attention instead of looking like ordinary pending-offline items.
 *   - Pending — items waiting for connectivity.
 *
 * Failed and pending are shown side by side when both exist — a failure never
 * hides the genuinely-pending remainder.
 */
import { WifiOff, Loader2, AlertTriangle } from "lucide-react";

interface OfflinePendingBadgeProps {
  count: number;
  failedCount: number;
  isSyncing: boolean;
}

export function OfflinePendingBadge({ count, failedCount, isSyncing }: OfflinePendingBadgeProps) {
  if (count === 0 && failedCount === 0 && !isSyncing) return null;

  if (isSyncing) {
    return (
      <div
        role="status"
        className="flex items-center gap-1.5 rounded-full bg-slate-100 border border-slate-300 px-3 py-1"
      >
        <Loader2 className="w-3.5 h-3.5 text-slate-600 animate-spin" aria-hidden="true" />
        <span className="text-xs font-medium text-slate-700">Sincronizando...</span>
      </div>
    );
  }

  const pendingCount = Math.max(0, count - failedCount);

  return (
    <div className="flex items-center gap-1.5">
      {failedCount > 0 && (
        <div
          role="status"
          className="flex items-center gap-1.5 rounded-full bg-amber-100 border border-amber-400 px-3 py-1"
        >
          <AlertTriangle className="w-3.5 h-3.5 text-amber-700" aria-hidden="true" />
          <span className="text-xs font-medium text-amber-800">
            {failedCount} sin sincronizar
          </span>
        </div>
      )}
      {pendingCount > 0 && (
        <div
          role="status"
          className="flex items-center gap-1.5 rounded-full bg-slate-100 border border-slate-300 px-3 py-1"
        >
          <WifiOff className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />
          <span className="text-xs font-medium text-slate-700">
            {pendingCount} pendiente{pendingCount !== 1 ? "s" : ""} sin conexión
          </span>
        </div>
      )}
    </div>
  );
}
