import { Badge } from '@/components/ui/badge';

interface AnnouncementStatusBadgeProps {
  publishedAt: Date | string | null;
  expiresAt: Date | string | null;
}

export function AnnouncementStatusBadge({
  publishedAt,
  expiresAt,
}: AnnouncementStatusBadgeProps) {
  const now = new Date();

  // Convert strings to dates if needed
  const publishedDate = publishedAt ? new Date(publishedAt) : null;
  const expiredDate = expiresAt ? new Date(expiresAt) : null;

  if (!publishedDate && !expiredDate) {
    return (
      <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
        Sin fecha
      </Badge>
    );
  }

  const isScheduled = publishedDate && publishedDate > now;
  const isExpired = expiredDate && expiredDate < now;
  const isLive = publishedDate && publishedDate <= now && (!expiredDate || expiredDate > now);

  if (isScheduled) {
    return (
      <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-200">
        Programada
      </Badge>
    );
  }

  if (isExpired) {
    return (
      <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-200 border-gray-200">
        Expirada
      </Badge>
    );
  }

  if (isLive) {
    return (
      <Badge className="bg-green-100 text-green-700 hover:bg-green-200 border-green-200">
        En vivo
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
      Sin estado
    </Badge>
  );
}
