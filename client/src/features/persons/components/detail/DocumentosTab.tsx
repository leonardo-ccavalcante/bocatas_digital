/**
 * DocumentosTab — person documents.
 *
 * There is NO person-documents collection endpoint today (the persons router
 * exposes only a single `foto_documento_url` field, an admin-only ID-photo).
 * Per the visual-port brief we must NOT fabricate a document list, so this tab
 * shows an honest empty state plus a link to the one real document when it
 * exists (admin-only).
 *
 * TODO(frontend-v4): needs person documents endpoint (list of typed documents
 * with estado/vigencia) — wire here once available.
 */
import { ExternalLink, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Database } from "@/lib/database.types";
import { DetailEmptyState } from "./DetailEmptyState";

type PersonRow = Database["public"]["Tables"]["persons"]["Row"];

interface DocumentosTabProps {
  person: PersonRow;
  isAdmin: boolean;
}

export function DocumentosTab({ person, isAdmin }: DocumentosTabProps) {
  // The only real document field is the admin-only ID photo.
  const fotoDocumento = isAdmin ? person.foto_documento_url : null;

  if (!fotoDocumento) {
    return (
      <DetailEmptyState
        icon={FileText}
        title="Sin documentos"
        description="Todavía no hay documentos archivados para esta persona."
      />
    );
  }

  return (
    <section className="bocatas-card">
      <header className="border-b border-border px-5 py-3">
        <p className="text-eyebrow text-muted-foreground">Documentos</p>
      </header>
      <ul className="divide-y divide-border">
        <li className="flex items-center gap-3 px-5 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
            <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-body-sm font-medium text-foreground">
              Documento de identidad
            </p>
            <p className="text-xs text-muted-foreground">Foto archivada</p>
          </div>
          <Button asChild size="sm" variant="outline">
            <a
              href={fotoDocumento}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Ver documento de identidad"
            >
              Ver <ExternalLink className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </Button>
        </li>
      </ul>
    </section>
  );
}
