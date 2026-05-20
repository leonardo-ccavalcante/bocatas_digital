/**
 * NovedadDetalle.tsx — Single announcement detail page (v4 visual port)
 *
 * Task 7 — Uses BackLink (default export from @/components/layout/BackLink)
 * and getCategoryMeta() from features/announcements/categories.ts.
 */

import { useRoute } from "wouter";
import { Pin, Calendar, AlertTriangle, User } from "lucide-react";
import { useAnnouncement } from "@/features/announcements/hooks/useAnnouncements";
import { Skeleton } from "@/components/ui/skeleton";
import BackLink from "@/components/layout/BackLink";
import { getCategoryMeta } from "@/features/announcements/categories";
import { cn } from "@/lib/utils";

export default function NovedadDetalle() {
  const [, params] = useRoute("/novedades/:id");
  const id = params?.id ?? "";
  const { data: announcement, isLoading, error } = useAnnouncement(id);

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  if (error || !announcement) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <BackLink label="Novedades" href="/novedades" />
        <div className="mt-4 rounded-2xl bg-destructive/10 border border-destructive/20 p-6 text-center text-destructive text-sm">
          Novedad no encontrada
        </div>
      </div>
    );
  }

  const a = announcement as Record<string, unknown>;
  const tipo = (a.tipo as string) ?? "info";
  const esUrgente = a.es_urgente === true;
  const catMeta = getCategoryMeta(tipo);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Back navigation */}
      <BackLink label="Novedades" href="/novedades" />

      {/* Type banner */}
      <div
        className={cn(
          "rounded-2xl border p-4 flex items-center gap-3",
          catMeta.chipClass
        )}
      >
        {esUrgente && (
          <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />
        )}
        <span className="font-semibold text-sm">
          {esUrgente ? "Urgente · " : ""}
          {catMeta.label}
        </span>
        {(a.fijado as boolean) && (
          <span className="ml-auto flex items-center gap-1 text-xs font-medium">
            <Pin className="w-3.5 h-3.5" aria-hidden="true" />
            Anclado
          </span>
        )}
      </div>

      {/* Image */}
      {(a.imagen_url as string | null) && (
        <img
          src={a.imagen_url as string}
          alt={a.titulo as string}
          className="w-full rounded-2xl object-cover max-h-64"
          loading="lazy"
          decoding="async"
          width={672}
          height={256}
        />
      )}

      {/* Content */}
      <div className="space-y-4">
        <h1 className="text-display-2 text-foreground leading-tight">
          {a.titulo as string}
        </h1>

        <div className="flex flex-wrap items-center gap-3 text-body-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4" aria-hidden="true" />
            {new Date(a.created_at as string).toLocaleDateString("es-ES", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </span>
          {(a.autor_nombre as string | null) && (
            <span className="flex items-center gap-1.5">
              <User className="w-4 h-4" aria-hidden="true" />
              {a.autor_nombre as string}
            </span>
          )}
        </div>

        <div className="text-body text-foreground/80 leading-relaxed whitespace-pre-wrap">
          {a.contenido as string}
        </div>

        {/* Validity period */}
        {(a.fecha_fin as string | null) && (
          <div className="rounded-xl bg-muted border border-border p-3 text-body-sm text-muted-foreground">
            <span className="font-medium text-foreground">Vigente hasta: </span>
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
