/**
 * PersonDocumentsModal — ver dentro de la app las imágenes archivadas.
 *
 * Sustituye a un `<a target="_blank">` que abría la URL firmada en otra
 * pestaña, con el enlace a la vista en la barra de direcciones y sin ningún
 * rastro de quién lo miró.
 *
 * `enabled: open` no es una optimización: es lo que hace que NO se acuñe
 * ninguna URL —ni se escriba ninguna línea de auditoría— para quien nunca
 * abre esto. `gcTime` corto para que el enlace a la PII no se quede en la
 * caché de React Query los cinco minutos por defecto tras cerrar.
 */
import { useEffect, useState } from "react";
import { FileText, IdCard, Loader2, Lock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { formatDateDisplay } from "@/lib/dateUtils";
import { CONSENT_PURPOSE_LABELS } from "../../schemas";
import { PersonDocumentViewer } from "./PersonDocumentViewer";

interface PersonDocumentsModalProps {
  personId: string;
  /** Sólo para el título. NUNCA viaja a la auditoría. */
  nombreCompleto?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Documento a mostrar al abrir. Lo fija la fila que se ha pulsado. */
  indiceInicial?: number;
}

const TITULO = { identidad: "Documento de identidad", consentimiento: "Consentimiento firmado" };

export function PersonDocumentsModal({
  personId,
  nombreCompleto,
  open,
  onOpenChange,
  indiceInicial = 0,
}: PersonDocumentsModalProps) {
  const [indice, setIndice] = useState(indiceInicial);
  // Pulsar «Ver» en la segunda fila tiene que abrir la segunda, no la primera.
  useEffect(() => {
    if (open) setIndice(indiceInicial);
  }, [open, indiceInicial]);
  const { data, isLoading, error, refetch } = trpc.persons.getDocumentUrls.useQuery(
    { personId },
    { enabled: open, staleTime: 30_000, gcTime: 30_000, retry: false, refetchOnWindowFocus: false }
  );

  const documentos = data?.documentos ?? [];
  const actual = documentos[Math.min(indice, Math.max(documentos.length - 1, 0))];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="ph-no-capture flex max-h-[90vh] max-w-3xl flex-col overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Documentos archivados{nombreCompleto ? ` — ${nombreCompleto}` : ""}
          </DialogTitle>
          <DialogDescription>
            Sólo superadministración puede ver estas imágenes. Cada consulta queda
            registrada.
          </DialogDescription>
        </DialogHeader>

        {/* La autorización para archivar no consta en la ficha: no hay columna
            ni fila que la recoja hasta que entre el fin de consentimiento
            propio (#149). Decirlo aquí es lo único honesto que se puede hacer
            hoy, y este es el único sitio donde un superadmin lo va a leer. */}
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-muted-foreground dark:border-amber-700/60 dark:bg-amber-950/30">
          Archivar la foto de un documento requiere autorización expresa de la
          persona. Todavía no queda registro de esa autorización en la ficha (#149).
        </p>

        {isLoading && (
          <div role="status" aria-live="polite" className="flex items-center justify-center gap-2 py-10 text-body-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando documentos…
          </div>
        )}

        {!isLoading && error && (
          <div className="space-y-3 py-6 text-center">
            <p className="text-body-sm text-muted-foreground">
              {error.data?.code === "FORBIDDEN"
                ? "No tienes permiso para ver estos documentos."
                : "No se pudieron cargar los documentos."}
            </p>
            {error.data?.code !== "FORBIDDEN" && (
              <Button size="sm" variant="outline" onClick={() => void refetch()}>
                Reintentar
              </Button>
            )}
          </div>
        )}

        {!isLoading && !error && documentos.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <FileText className="h-8 w-8" aria-hidden="true" />
            <p className="text-body-sm">No hay ninguna foto de documento guardada.</p>
          </div>
        )}

        {documentos.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {documentos.map((d, i) => (
              <Button
                key={`${d.kind}-${i}`}
                size="sm"
                variant={i === indice ? "default" : "outline"}
                onClick={() => setIndice(i)}
              >
                {d.kind === "identidad" ? (
                  <IdCard className="mr-1 h-4 w-4" aria-hidden="true" />
                ) : (
                  <FileText className="mr-1 h-4 w-4" aria-hidden="true" />
                )}
                {TITULO[d.kind]}
              </Button>
            ))}
          </div>
        )}

        {actual && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-body-sm">
              <span className="font-medium">{TITULO[actual.kind]}</span>
              {actual.archivadoEn && (
                <span className="text-muted-foreground">
                  · Archivado el {formatDateDisplay(actual.archivadoEn)}
                </span>
              )}
            </div>
            {/* Sí y no por separado: la hoja documenta las dos cosas, y decir
                «autoriza» sobre un fin denegado sería afirmar un
                consentimiento que no existe. */}
            {actual.purposes.some((p) => p.granted) && (
              <p className="text-xs text-muted-foreground">
                Autoriza:{" "}
                {actual.purposes
                  .filter((p) => p.granted)
                  .map((p) => CONSENT_PURPOSE_LABELS[p.purpose] ?? p.purpose)
                  .join(" · ")}
              </p>
            )}
            {actual.purposes.some((p) => !p.granted) && (
              <p className="text-xs text-muted-foreground">
                Denegado:{" "}
                {actual.purposes
                  .filter((p) => !p.granted)
                  .map((p) => CONSENT_PURPOSE_LABELS[p.purpose] ?? p.purpose)
                  .join(" · ")}
              </p>
            )}
            {actual.url ? (
              <PersonDocumentViewer
                url={actual.url}
                descripcion={`Foto archivada del ${TITULO[actual.kind].toLowerCase()}`}
              />
            ) : (
              // La entrada existe pero no se pudo firmar. Se muestra igual:
              // "consta y no abre" no es lo mismo que "no hay nada", y
              // confundirlos lleva a concluir que la foto nunca se tomó.
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-body-sm dark:border-amber-700/60 dark:bg-amber-950/30">
                <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  Este documento consta en la ficha pero no se pudo abrir. Vuelve a
                  intentarlo; si se repite, avisa al equipo técnico.
                </span>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
