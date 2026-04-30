/**
 * NovedadDetalle.tsx — Single announcement detail page.
 * Visible to any authenticated user; visibility is enforced server-side
 * via announcement_audiences (NOT_FOUND if user is outside the audience).
 */
import { useRoute, Link } from "wouter";
import {
  ArrowLeft,
  Pin,
  Calendar,
  AlertTriangle,
  Info,
  PartyPopper,
  DoorClosed,
  Megaphone,
  User,
  Users,
  Clock,
} from "lucide-react";
import { useAnnouncement } from "@/features/announcements/hooks/useAnnouncements";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type {
  TipoAnnouncement,
  AudienceRule,
} from "@shared/announcementTypes";

const TIPO_CONFIG: Record<
  TipoAnnouncement,
  { label: string; color: string; icon: React.ReactNode; bg: string }
> = {
  info: {
    label: "Información",
    color: "text-blue-700",
    bg: "bg-blue-50 border-blue-200",
    icon: <Info className="w-5 h-5 text-blue-600" />,
  },
  evento: {
    label: "Evento",
    color: "text-green-700",
    bg: "bg-green-50 border-green-200",
    icon: <PartyPopper className="w-5 h-5 text-green-600" />,
  },
  cierre_servicio: {
    label: "Cierre de servicio",
    color: "text-orange-700",
    bg: "bg-orange-50 border-orange-200",
    icon: <DoorClosed className="w-5 h-5 text-orange-600" />,
  },
  convocatoria: {
    label: "Convocatoria",
    color: "text-purple-700",
    bg: "bg-purple-50 border-purple-200",
    icon: <Megaphone className="w-5 h-5 text-purple-600" />,
  },
};

function formatRule(rule: AudienceRule): string {
  const roles = rule.roles.length === 0 ? "todos los roles" : rule.roles.join(", ");
  const programs =
    rule.programs.length === 0 ? "todos los programas" : rule.programs.join(", ");
  return `${roles} · ${programs}`;
}

function formatDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

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

  const a = announcement as Record<string, unknown>;
  const tipo = (a.tipo as string) ?? "info";
  const config =
    (TIPO_CONFIG as Record<string, (typeof TIPO_CONFIG)[TipoAnnouncement]>)[tipo] ??
    TIPO_CONFIG.info;
  const esUrgente = a.es_urgente === true;
  const audiences = (a.announcement_audiences as AudienceRule[] | undefined) ?? [];
  const fechaInicio = a.fecha_inicio as string | null;
  const fechaFin = a.fecha_fin as string | null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Back */}
      <Link href="/novedades">
        <Button variant="ghost" size="sm" className="gap-2 -ml-2">
          <ArrowLeft className="w-4 h-4" /> Novedades
        </Button>
      </Link>

      {/* Type + urgent + pinned banner */}
      <div className={`rounded-2xl border p-4 flex items-center gap-3 flex-wrap ${config.bg}`}>
        {config.icon}
        <span className={`font-semibold text-sm ${config.color}`}>{config.label}</span>
        {esUrgente && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
            <AlertTriangle className="w-3 h-3" aria-hidden="true" /> Urgente
          </span>
        )}
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
        <h1 className="text-2xl font-bold text-gray-900 leading-tight">
          {a.titulo as string}
        </h1>

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

        {/* Visibility window */}
        {(fechaInicio || fechaFin) && (
          <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-sm text-gray-600 flex items-start gap-2">
            <Clock className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-gray-700 mb-0.5">Vigencia</p>
              {fechaInicio && (
                <p>
                  Desde <strong>{formatDateLong(fechaInicio)}</strong>
                </p>
              )}
              {fechaFin && (
                <p>
                  Hasta <strong>{formatDateLong(fechaFin)}</strong>
                </p>
              )}
            </div>
          </div>
        )}

        {/* Audience rules */}
        {audiences.length > 0 && (
          <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-sm text-gray-600 flex items-start gap-2">
            <Users className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-gray-700 mb-1">Dirigido a</p>
              <ul className="space-y-0.5 text-xs">
                {audiences.map((rule, idx) => (
                  <li key={idx}>· {formatRule(rule)}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
