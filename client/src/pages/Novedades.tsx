/**
 * Novedades.tsx — Announcement feed page
 * Visible to all authenticated users (role-filtered on server)
 * Task 7 — Phase F / Wave 4C
 */
import { useState } from "react";
import { Link } from "wouter";
import {
  Bell,
  Pin,
  Calendar,
  ChevronRight,
  AlertTriangle,
  Info,
  PartyPopper,
  DoorClosed,
  Megaphone,
} from "lucide-react";
import { useAnnouncements } from "@/features/announcements/hooks/useAnnouncements";
import type { TipoAnnouncement } from "@shared/announcementTypes";
import { Skeleton } from "@/components/ui/skeleton";
import { CrearNovedadButton } from "@/components/CrearNovedadButton";
import { AnnouncementStatusBadge } from "@/features/announcements/components/AnnouncementStatusBadge";

// ─── Tipo config (current values only — legacy urgente/cierre removed) ──────────

const TIPO_CONFIG: Record<TipoAnnouncement, { label: string; color: string; icon: React.ReactNode }> = {
  info: { label: "Info", color: "bg-blue-50 text-blue-700 border-blue-200", icon: <Info className="w-3.5 h-3.5" /> },
  evento: { label: "Evento", color: "bg-green-50 text-green-700 border-green-200", icon: <PartyPopper className="w-3.5 h-3.5" /> },
  cierre_servicio: { label: "Cierre", color: "bg-orange-50 text-orange-700 border-orange-200", icon: <DoorClosed className="w-3.5 h-3.5" /> },
  convocatoria: { label: "Convocatoria", color: "bg-purple-50 text-purple-700 border-purple-200", icon: <Megaphone className="w-3.5 h-3.5" /> },
};

type TipoFilter = "all" | TipoAnnouncement;

const FILTER_OPTIONS: { value: TipoFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "info", label: "Info" },
  { value: "evento", label: "Evento" },
  { value: "cierre_servicio", label: "Cierre" },
  { value: "convocatoria", label: "Convocatoria" },
];

export default function Novedades() {
  const [tipoFilter, setTipoFilter] = useState<TipoFilter>("all");
  const { data, isLoading, error } = useAnnouncements({
    tipo: tipoFilter === "all" ? undefined : tipoFilter,
    limit: 50,
  });

  const announcements = data?.announcements ?? [];
  const pinned = announcements.filter((a) => a.fijado);
  const regular = announcements.filter((a) => !a.fijado);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-[#C41230]/10 flex items-center justify-center">
          <Bell className="w-5 h-5 text-[#C41230]" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Novedades</h1>
          <p className="text-sm text-gray-500">Información y comunicados del equipo</p>
        </div>
        <div className="ml-auto">
          <CrearNovedadButton />
        </div>
      </div>

      {/* Type filters */}
      <div className="flex gap-2 flex-wrap">
        {FILTER_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setTipoFilter(value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              tipoFilter === value
                ? "bg-[#C41230] text-white border-[#C41230]"
                : "bg-white text-gray-600 border-gray-200 hover:border-[#C41230]/50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-2xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          Error al cargar novedades. Inténtalo de nuevo.
        </div>
      )}

      {/* Pinned */}
      {!isLoading && pinned.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
            <Pin className="w-3.5 h-3.5" /> Fijados
          </p>
          {pinned.map((a) => (
            <AnnouncementCard key={a.id} announcement={a} />
          ))}
        </div>
      )}

      {/* Regular */}
      {!isLoading && regular.length > 0 && (
        <div className="space-y-3">
          {pinned.length > 0 && (
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Recientes</p>
          )}
          {regular.map((a) => (
            <AnnouncementCard key={a.id} announcement={a} />
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && announcements.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Bell className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No hay novedades disponibles</p>
        </div>
      )}
    </div>
  );
}

function AnnouncementCard({ announcement: a }: { announcement: Record<string, unknown> }) {
  const tipo = (a.tipo as string) ?? "info";
  const config = TIPO_CONFIG[tipo as TipoAnnouncement] ?? TIPO_CONFIG.info;
  const esUrgente = a.es_urgente === true;

  return (
    <Link href={`/novedades/${a.id as string}`}>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${config.color}`}>
              {config.icon}
              {config.label}
            </span>
            {esUrgente && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                <AlertTriangle className="w-3 h-3" aria-hidden="true" /> Urgente
              </span>
            )}
            {(a.fijado as boolean) && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-50 text-yellow-700 border border-yellow-200">
                <Pin className="w-3 h-3" /> Fijado
              </span>
            )}
            <AnnouncementStatusBadge
              publishedAt={a.published_at as string | null}
              expiresAt={a.expires_at as string | null}
            />
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 mt-0.5" />
        </div>

        <h3 className="font-semibold text-gray-900 text-sm leading-snug">{a.titulo as string}</h3>

        <p className="text-xs text-gray-500 line-clamp-2">{a.contenido as string}</p>

        <div className="flex items-center gap-1 text-xs text-gray-400">
          <Calendar className="w-3 h-3" />
          {new Date(a.created_at as string).toLocaleDateString("es-ES", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
          {(a.autor_nombre as string | null) && (
            <span className="ml-1">· {a.autor_nombre as string}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
