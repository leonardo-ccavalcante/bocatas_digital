/**
 * NovedadDetalle.tsx — Single announcement detail page
 * Task 7 — Phase F
 */
import { useRoute, Link } from "wouter";
import { ArrowLeft, Pin, Calendar, AlertTriangle, Info, PartyPopper, DoorClosed, User } from "lucide-react";
import { useAnnouncement } from "@/features/announcements/hooks/useAnnouncements";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

const TIPO_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode; bg: string }> = {
  info: { label: "Información", color: "text-blue-700", bg: "bg-blue-50 border-blue-200", icon: <Info className="w-5 h-5 text-blue-600" /> },
  urgente: { label: "Urgente", color: "text-red-700", bg: "bg-red-50 border-red-200", icon: <AlertTriangle className="w-5 h-5 text-red-600" /> },
  evento: { label: "Evento", color: "text-green-700", bg: "bg-green-50 border-green-200", icon: <PartyPopper className="w-5 h-5 text-green-600" /> },
  cierre: { label: "Cierre", color: "text-orange-700", bg: "bg-orange-50 border-orange-200", icon: <DoorClosed className="w-5 h-5 text-orange-600" /> },
};

export default function NovedadDetalle() {
  const [, params] = useRoute("/novedades/:id");
  const id = params?.id ?? "";
  const { data: announcement, isLoading, error } = useAnnouncement(id);

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  if (error || !announcement) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <Link href="/novedades">
          <Button variant="ghost" size="sm" className="mb-4 gap-2">
            <ArrowLeft className="w-4 h-4" /> Volver
          </Button>
        </Link>
        <div className="rounded-2xl bg-red-50 border border-red-200 p-6 text-center text-red-700">
          Novedad no encontrada
        </div>
      </div>
    );
  }

  const tipo = (announcement as Record<string, unknown>).tipo as string ?? "info";
  const config = TIPO_CONFIG[tipo] ?? TIPO_CONFIG.info;
  const a = announcement as Record<string, unknown>;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Back */}
      <Link href="/novedades">
        <Button variant="ghost" size="sm" className="gap-2 -ml-2">
          <ArrowLeft className="w-4 h-4" /> Novedades
        </Button>
      </Link>

      {/* Type banner */}
      <div className={`rounded-2xl border p-4 flex items-center gap-3 ${config.bg}`}>
        {config.icon}
        <span className={`font-semibold text-sm ${config.color}`}>{config.label}</span>
        {(a.fijado as boolean) && (
          <span className="ml-auto flex items-center gap-1 text-xs text-yellow-700 font-medium">
            <Pin className="w-3.5 h-3.5" /> Fijado
          </span>
        )}
      </div>

      {/* Image */}
      {(a.imagen_url as string | null) && (
        <img
          src={a.imagen_url as string}
          alt={a.titulo as string}
          className="w-full rounded-2xl object-cover max-h-64"
        />
      )}

      {/* Content */}
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-900 leading-tight">{a.titulo as string}</h1>

        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
          <span className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4" />
            {new Date(a.created_at as string).toLocaleDateString("es-ES", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </span>
          {(a.autor_nombre as string | null) && (
            <span className="flex items-center gap-1.5">
              <User className="w-4 h-4" />
              {a.autor_nombre as string}
            </span>
          )}
        </div>

        <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed whitespace-pre-wrap">
          {a.contenido as string}
        </div>

        {/* Date range */}
        {(a.fecha_fin as string | null) && (
          <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-sm text-gray-600">
            <span className="font-medium">Vigente hasta: </span>
            {new Date(a.fecha_fin as string).toLocaleDateString("es-ES", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </div>
        )}
      </div>
    </div>
  );
}
