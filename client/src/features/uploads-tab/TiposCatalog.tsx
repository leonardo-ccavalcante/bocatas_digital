import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Download } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useProgramDocumentTypes } from "./hooks/useProgramDocumentTypes";

interface TiposCatalogProps {
  programaId: string;
}

interface TipoRow {
  id: string;
  slug: string;
  nombre: string;
  scope: string;
  template_url: string | null;
  template_filename: string | null;
  template_version: string | null;
  guide_url: string | null;
  guide_filename: string | null;
  guide_version: string | null;
  is_required: boolean;
}

export function TiposCatalog({ programaId }: TiposCatalogProps) {
  const { data, isLoading } = useProgramDocumentTypes(programaId);
  const utils = trpc.useUtils();

  const onDownload = async (path: string, filename: string) => {
    try {
      const { signedUrl } = await utils.programDocumentTypes.signedUrl.fetch({ path });
      const a = document.createElement("a");
      a.href = signedUrl;
      a.download = filename;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al descargar");
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-3 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const rows = (data ?? []) as TipoRow[];

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground text-sm">
          No hay tipos de documento configurados para este programa.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-sm font-medium mb-2">Tipos de documento</div>
        <ul className="divide-y">
          {rows.map((t) => (
            <li
              key={t.id}
              className="py-2 flex flex-wrap items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <div className="font-medium truncate">{t.nombre}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {t.scope === "familia" ? "Por familia" : "Por miembro"}
                    {t.is_required ? " · Obligatorio" : ""}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                {t.template_url && t.template_filename && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onDownload(t.template_url!, t.template_filename!)}
                    aria-label={`Descargar plantilla de ${t.nombre}`}
                  >
                    <Download className="h-3 w-3 mr-1" aria-hidden="true" />
                    Plantilla
                    {t.template_version ? ` (${t.template_version})` : ""}
                  </Button>
                )}
                {t.guide_url && t.guide_filename && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onDownload(t.guide_url!, t.guide_filename!)}
                    aria-label={`Descargar guía de ${t.nombre}`}
                  >
                    <Download className="h-3 w-3 mr-1" aria-hidden="true" />
                    Guía
                    {t.guide_version ? ` (${t.guide_version})` : ""}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
