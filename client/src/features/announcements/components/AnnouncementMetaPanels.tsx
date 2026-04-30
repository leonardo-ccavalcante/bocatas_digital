/**
 * AnnouncementMetaPanels.tsx — Two collapsible panels for the admin edit form:
 *   1. "Historial de cambios" (audit log) — always shown when editing
 *   2. "Visto por" (dismissal stats) — only shown when announcement is urgent
 *
 * Pure presentation; data is fetched via the announcements hooks.
 */
import { useState } from "react";
import { ChevronDown, ChevronRight, Eye, History, Users } from "lucide-react";
import {
  useAnnouncementAuditLog,
  useDismissalStats,
} from "@/features/announcements/hooks/useAnnouncements";

interface Props {
  announcementId: string;
  isUrgent: boolean;
}

interface AuditRow {
  id: string;
  edited_at: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  editor_nombre: string | null;
}

interface DismissalStats {
  total_audience: number;
  dismissed: number;
  pending_names: { person_id: string; nombre: string; apellidos: string | null }[];
}

function formatValue(raw: string | null): string {
  if (raw === null) return "(vacío)";
  // Most fields are JSON-stringified; try to parse for nicer display.
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "string") return parsed;
    return JSON.stringify(parsed);
  } catch {
    return raw;
  }
}

function AuditLogPanel({ announcementId }: { announcementId: string }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useAnnouncementAuditLog(announcementId);
  const rows = (data ?? []) as AuditRow[];

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <History className="w-4 h-4 text-gray-500" />
          Historial de cambios
          {rows.length > 0 && (
            <span className="text-xs text-gray-400">({rows.length})</span>
          )}
        </span>
        {open ? (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {open && (
        <div className="border-t border-gray-100 p-3 max-h-64 overflow-y-auto">
          {isLoading && <p className="text-xs text-gray-400">Cargando…</p>}
          {!isLoading && rows.length === 0 && (
            <p className="text-xs text-gray-400">Sin cambios registrados.</p>
          )}
          {!isLoading && rows.length > 0 && (
            <ul className="space-y-2">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="text-xs border-b border-gray-100 last:border-b-0 pb-2 last:pb-0"
                >
                  <div className="flex items-center justify-between text-gray-500">
                    <span className="font-medium text-gray-700">
                      {row.field}
                    </span>
                    <time>
                      {new Date(row.edited_at).toLocaleString("es-ES", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                  <div className="mt-1 text-gray-600">
                    <span className="text-red-600 line-through">
                      {formatValue(row.old_value)}
                    </span>
                    {" → "}
                    <span className="text-green-700">
                      {formatValue(row.new_value)}
                    </span>
                  </div>
                  {row.editor_nombre && (
                    <p className="mt-0.5 text-gray-400">
                      por {row.editor_nombre}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function DismissalStatsPanel({ announcementId }: { announcementId: string }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useDismissalStats(announcementId);
  const stats = data as DismissalStats | undefined;

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-gray-500" />
          Visto por
          {stats && (
            <span className="text-xs text-gray-400">
              ({stats.dismissed} / {stats.total_audience})
            </span>
          )}
        </span>
        {open ? (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {open && (
        <div className="border-t border-gray-100 p-3 max-h-64 overflow-y-auto">
          {isLoading && <p className="text-xs text-gray-400">Cargando…</p>}
          {!isLoading && stats && (
            <>
              <p className="text-xs text-gray-600 mb-2 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-gray-400" />
                {stats.dismissed} de {stats.total_audience} ya descartaron el
                aviso urgente.
              </p>
              {stats.pending_names.length > 0 ? (
                <>
                  <p className="text-xs font-medium text-gray-600 mb-1">
                    Pendientes ({stats.pending_names.length}):
                  </p>
                  <ul className="text-xs text-gray-500 space-y-0.5">
                    {stats.pending_names.map((p) => (
                      <li key={p.person_id}>
                        {p.nombre}
                        {p.apellidos ? ` ${p.apellidos}` : ""}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-xs text-green-700">
                  Toda la audiencia ya lo vio.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function AnnouncementMetaPanels({ announcementId, isUrgent }: Props) {
  return (
    <div className="space-y-2">
      <AuditLogPanel announcementId={announcementId} />
      {isUrgent && <DismissalStatsPanel announcementId={announcementId} />}
    </div>
  );
}
