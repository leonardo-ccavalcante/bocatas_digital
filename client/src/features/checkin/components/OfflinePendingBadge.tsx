/**
 * OfflinePendingBadge.tsx — Shows count of pending offline check-ins.
 * Visible when there are items in the offline queue.
 */
import { WifiOff, Loader2 } from "lucide-react";

interface OfflinePendingBadgeProps {
  count: number;
  isSyncing: boolean;
}

export function OfflinePendingBadge({ count, isSyncing }: OfflinePendingBadgeProps) {
  if (count === 0 && !isSyncing) return null;

  return (
    <div className="flex items-center gap-1.5 rounded-full bg-slate-100 border border-slate-300 px-3 py-1">
      {isSyncing ? (
        <Loader2 className="w-3.5 h-3.5 text-slate-600 animate-spin" />
      ) : (
        <WifiOff className="w-3.5 h-3.5 text-slate-600" />
      )}
      <span className="text-xs font-medium text-slate-700">
        {isSyncing ? "Sincronizando..." : `${count} pendiente${count !== 1 ? "s" : ""} sin conexión`}
      </span>
    </div>
  );
}
