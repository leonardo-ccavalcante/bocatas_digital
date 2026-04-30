import { useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useUrgentBannerAnnouncement,
  useDismissUrgentAnnouncement,
} from "@/features/announcements/hooks/useAnnouncements";

const MAX_CONTENIDO_LENGTH = 120;

function truncate(text: string): string {
  if (text.length <= MAX_CONTENIDO_LENGTH) return text;
  return `${text.slice(0, MAX_CONTENIDO_LENGTH)}...`;
}

export default function UrgentAnnouncementBanner() {
  const { data, isLoading } = useUrgentBannerAnnouncement();
  const { mutate: dismissUrgent } = useDismissUrgentAnnouncement();
  const [dismissed, setDismissed] = useState(false);

  if (isLoading || !data || dismissed) return null;

  function handleDismiss() {
    setDismissed(true);
    dismissUrgent({ announcement_id: data!.id });
  }

  return (
    <div
      role="alert"
      aria-live="polite"
      className="flex items-start gap-3 rounded-xl border border-[#C41230]/30 bg-[#C41230]/10 px-4 py-3 mb-6"
    >
      <AlertTriangle
        className="h-5 w-5 shrink-0 mt-0.5 text-[#C41230]"
        aria-hidden="true"
      />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#C41230] leading-tight">
          {data.titulo}
        </p>
        <p className="text-sm text-foreground mt-0.5 leading-snug">
          {truncate(data.contenido)}
        </p>
        <Link
          href={`/novedades/${data.id}`}
          className="text-sm font-medium text-[#C41230] underline underline-offset-2 hover:opacity-80 mt-1 inline-block"
        >
          Ver novedad
        </Link>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 h-7 w-7 text-[#C41230] hover:bg-[#C41230]/10"
        aria-label="Cerrar aviso urgente"
        onClick={handleDismiss}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
