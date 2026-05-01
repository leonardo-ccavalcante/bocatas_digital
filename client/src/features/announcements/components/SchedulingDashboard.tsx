import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock } from 'lucide-react';

interface Announcement {
  id: string;
  titulo: string;
  published_at: string | null;
  expires_at: string | null;
}

interface SchedulingDashboardProps {
  announcements: Announcement[];
  onReschedule?: (announcementId: string, newDate: Date) => void;
}

export function SchedulingDashboard({
  announcements,
  onReschedule,
}: SchedulingDashboardProps) {
  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Group announcements by status
  const grouped = useMemo(() => {
    const scheduled = announcements.filter((a) => {
      if (!a.published_at) return false;
      return new Date(a.published_at) > now;
    });

    const live = announcements.filter((a) => {
      if (!a.published_at) return false;
      const publishedDate = new Date(a.published_at);
      const expiredDate = a.expires_at ? new Date(a.expires_at) : null;
      return publishedDate <= now && (!expiredDate || expiredDate > now);
    });

    const expired = announcements.filter((a) => {
      if (!a.expires_at) return false;
      return new Date(a.expires_at) < now;
    });

    return { scheduled, live, expired };
  }, [announcements]);

  // Generate timeline data
  const timelineData = useMemo(() => {
    const items = announcements
      .filter((a) => a.published_at || a.expires_at)
      .map((a) => ({
        id: a.id,
        titulo: a.titulo,
        startDate: a.published_at ? new Date(a.published_at) : now,
        endDate: a.expires_at ? new Date(a.expires_at) : thirtyDaysFromNow,
      }))
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

    return items;
  }, [announcements]);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('es-ES', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <Calendar className="w-5 h-5" />
          Calendario de Publicación
        </h3>

        {/* Status Summary */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card className="p-4">
            <div className="text-sm font-medium text-muted-foreground">Programadas</div>
            <div className="text-2xl font-bold text-blue-600">{grouped.scheduled.length}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm font-medium text-muted-foreground">En vivo</div>
            <div className="text-2xl font-bold text-green-600">{grouped.live.length}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm font-medium text-muted-foreground">Expiradas</div>
            <div className="text-2xl font-bold text-gray-600">{grouped.expired.length}</div>
          </Card>
        </div>
      </div>

      {/* Timeline View */}
      <div>
        <h4 className="font-medium flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4" />
          Línea de Tiempo
        </h4>

        <div className="space-y-3">
          {timelineData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No hay novedades programadas
            </p>
          ) : (
            <ul className="space-y-3">
              {timelineData.map((item) => {
                const daysFromNow = Math.ceil(
                  (item.startDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
                );
                const isScheduled = item.startDate > now;
                const isLive = item.startDate <= now && item.endDate > now;
                const isExpired = item.endDate < now;

                let statusColor = 'bg-gray-100';
                let statusText = 'Sin estado';

                if (isScheduled) {
                  statusColor = 'bg-blue-100';
                  statusText = `En ${daysFromNow} días`;
                } else if (isLive) {
                  statusColor = 'bg-green-100';
                  statusText = 'En vivo';
                } else if (isExpired) {
                  statusColor = 'bg-gray-100';
                  statusText = 'Expirada';
                }

                return (
                  <li
                    key={item.id}
                    className={`p-3 rounded-lg border ${statusColor} flex justify-between items-center`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{item.titulo}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(item.startDate)} → {formatDate(item.endDate)}
                      </p>
                    </div>
                    <Badge variant="outline" className="ml-2 flex-shrink-0">
                      {statusText}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
