/**
 * DocumentosTab — imágenes archivadas de esta persona.
 *
 * Antes enlazaba con `<a target="_blank">` a la URL firmada que getById metía
 * en la ficha, y la veían admin Y superadmin. Ahora la ficha ya no trae esa
 * URL: se acuña bajo demanda, sólo para superadministración y con auditoría
 * (persons.getDocumentUrls).
 *
 * A un admin se le dice «acceso restringido», NUNCA «sin documentos». Decirle
 * que no hay documentos cuando sí los hay es fabricar datos — lo que la
 * cabecera anterior de este archivo ya prohibía — y es además el patrón que
 * sigue la pestaña de Asistencias.
 */
import { useState } from "react";
import { FileText, IdCard, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { formatDateDisplay } from "@/lib/dateUtils";
import { PersonDocumentsModal } from "../documents";
import { DetailEmptyState } from "./DetailEmptyState";

interface DocumentosTabProps {
  personId: string;
  nombreCompleto: string;
  isSuperadmin: boolean;
}

export function DocumentosTab({ personId, nombreCompleto, isSuperadmin }: DocumentosTabProps) {
  const [abierto, setAbierto] = useState(false);
  const { data, isLoading } = trpc.persons.getDocumentUrls.useQuery(
    { personId },
    { enabled: isSuperadmin, staleTime: 30_000, gcTime: 30_000, retry: false }
  );

  if (!isSuperadmin) {
    return (
      <DetailEmptyState
        icon={Lock}
        title="Acceso restringido"
        description="Las fotos de documentos archivados sólo están disponibles para superadministración."
      />
    );
  }

  const documentos = data?.documentos ?? [];

  if (!isLoading && documentos.length === 0) {
    return (
      <DetailEmptyState
        icon={FileText}
        title="Sin documentos"
        description="Todavía no hay documentos archivados para esta persona."
      />
    );
  }

  return (
    <>
      <section className="bocatas-card">
        <header className="border-b border-border px-5 py-3">
          <p className="text-eyebrow text-muted-foreground">Documentos</p>
        </header>
        <ul className="divide-y divide-border">
          {documentos.map((doc, i) => (
            <li key={`${doc.kind}-${i}`} className="flex items-center gap-3 px-5 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                {doc.kind === "identidad" ? (
                  <IdCard className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                ) : (
                  <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-body-sm font-medium text-foreground">
                  {doc.kind === "identidad" ? "Documento de identidad" : "Consentimiento firmado"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {doc.archivadoEn ? `Archivado el ${formatDateDisplay(doc.archivadoEn)}` : "Foto archivada"}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setAbierto(true)}>
                Ver
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <PersonDocumentsModal
        personId={personId}
        nombreCompleto={nombreCompleto}
        open={abierto}
        onOpenChange={setAbierto}
      />
    </>
  );
}
