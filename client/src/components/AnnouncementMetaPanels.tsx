import { useState } from "react";
import { ChevronDown, Eye, EyeOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export interface AuditLogEntry {
  id: string;
  announcement_id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string;
  changed_at: string;
}

export interface DismissalStats {
  total_users: number;
  dismissed_count: number;
  pending_count: number;
  dismissal_rate: number;
}

interface AnnouncementMetaPanelsProps {
  announcementId: string;
  auditLog?: AuditLogEntry[];
  dismissalStats?: DismissalStats;
  isLoading?: boolean;
}

export function AnnouncementMetaPanels({
  announcementId,
  auditLog = [],
  dismissalStats,
  isLoading = false,
}: AnnouncementMetaPanelsProps) {
  const [expandedAudit, setExpandedAudit] = useState(false);
  const [expandedDismissals, setExpandedDismissals] = useState(false);

  return (
    <div className="space-y-4">
      {/* Audit Log Panel */}
      <Card className="overflow-hidden">
        <button
          onClick={() => setExpandedAudit(!expandedAudit)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <h3 className="font-semibold text-sm text-gray-900">
            Historial de cambios ({auditLog.length})
          </h3>
          <ChevronDown
            className={`w-4 h-4 text-gray-500 transition-transform ${
              expandedAudit ? "rotate-180" : ""
            }`}
          />
        </button>

        {expandedAudit && (
          <div className="border-t border-gray-200 divide-y divide-gray-200 max-h-64 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : auditLog.length === 0 ? (
              <div className="p-4 text-sm text-gray-500 text-center">
                Sin cambios registrados
              </div>
            ) : (
              auditLog.map((entry) => (
                <div key={entry.id} className="p-3 text-sm space-y-1">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs">
                      {entry.field_name}
                    </Badge>
                    <span className="text-xs text-gray-500">
                      {new Date(entry.changed_at).toLocaleString("es-AR")}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600">
                    <span className="font-medium">Por:</span> {entry.changed_by}
                  </div>
                  {entry.old_value && (
                    <div className="text-xs">
                      <span className="text-red-600">- {entry.old_value}</span>
                    </div>
                  )}
                  {entry.new_value && (
                    <div className="text-xs">
                      <span className="text-green-600">+ {entry.new_value}</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </Card>

      {/* Dismissal Stats Panel (for urgent announcements) */}
      {dismissalStats && (
        <Card className="overflow-hidden">
          <button
            onClick={() => setExpandedDismissals(!expandedDismissals)}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <h3 className="font-semibold text-sm text-gray-900">
              Visto por usuarios
            </h3>
            <ChevronDown
              className={`w-4 h-4 text-gray-500 transition-transform ${
                expandedDismissals ? "rotate-180" : ""
              }`}
            />
          </button>

          {expandedDismissals && (
            <div className="border-t border-gray-200 p-4 space-y-3">
              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-3 bg-green-50 rounded">
                      <div className="flex items-center justify-center gap-1 text-green-700 mb-1">
                        <Eye className="w-4 h-4" />
                        <span className="font-bold">
                          {dismissalStats.dismissed_count}
                        </span>
                      </div>
                      <p className="text-xs text-green-600">Visto</p>
                    </div>
                    <div className="text-center p-3 bg-yellow-50 rounded">
                      <div className="flex items-center justify-center gap-1 text-yellow-700 mb-1">
                        <EyeOff className="w-4 h-4" />
                        <span className="font-bold">
                          {dismissalStats.pending_count}
                        </span>
                      </div>
                      <p className="text-xs text-yellow-600">Pendiente</p>
                    </div>
                  </div>
                  <div className="text-center p-2 bg-gray-50 rounded">
                    <p className="text-xs text-gray-600 mb-1">Tasa de visualización</p>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{
                          width: `${dismissalStats.dismissal_rate * 100}%`,
                        }}
                      />
                    </div>
                    <p className="text-xs font-semibold text-gray-700 mt-1">
                      {Math.round(dismissalStats.dismissal_rate * 100)}%
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
