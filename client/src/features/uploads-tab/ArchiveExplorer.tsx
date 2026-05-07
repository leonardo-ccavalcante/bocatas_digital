import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eye, Filter } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { getSignedDocUrl } from "@/features/families/utils/signedUrl";
import { useProgramDocumentTypes } from "./hooks/useProgramDocumentTypes";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DocRow {
  id: string;
  documento_tipo: string;
  family_id: string;
  member_index: number;
  documento_url: string;
  fecha_upload: string | null;
  created_at: string;
  families: {
    familia_numero: number;
    persons: { nombre: string; apellidos: string };
  };
}

interface ArchiveExplorerProps {
  programaId: string;
  onReclassify: (docId: string, currentTipo: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ArchiveExplorer({ programaId, onReclassify }: ArchiveExplorerProps) {
  // "__all__" is the sentinel meaning "no filter" (Radix Select forbids value="")
  const ALL_TIPOS = "__all__";
  const [tipoSlug, setTipoSlug] = useState<string>(ALL_TIPOS);

  const { data: docTypes = [] } = useProgramDocumentTypes(programaId);

  const activeSlug = tipoSlug === ALL_TIPOS ? undefined : tipoSlug;

  const { data, isLoading } = trpc.families.listAllForProgram.useQuery(
    {
      tipoSlug: activeSlug,
      limit: 50,
      offset: 0,
    },
    { enabled: !!programaId }
  );

  // Build slug → nombre lookup from the registered types.
  const tipoLabelMap = new Map<string, string>(
    (docTypes as Array<{ slug: string; nombre: string }>).map((t) => [t.slug, t.nombre])
  );

  function tipoLabel(slug: string): string {
    return tipoLabelMap.get(slug) ?? slug;
  }

  async function handleVer(documentoUrl: string) {
    const url = await getSignedDocUrl(documentoUrl);
    if (url) {
      window.open(url, "_blank");
    }
  }

  function handleTipoChange(value: string) {
    setTipoSlug(value);
  }

  const rows = (data?.rows ?? []) as DocRow[];
  const total = data?.total ?? 0;

  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-sm font-medium mb-3">Archivo</div>

        {/* Filter row */}
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
          <Select
            value={tipoSlug}
            onValueChange={handleTipoChange}
          >
            <SelectTrigger
              className="w-[200px]"
              aria-label="Filtrar por tipo"
            >
              <SelectValue placeholder="Todos los tipos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_TIPOS}>Todos los tipos</SelectItem>
              {(docTypes as Array<{ id: string; slug: string; nombre: string }>).map((t) => (
                <SelectItem key={t.id} value={t.slug}>
                  {t.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="border rounded-lg overflow-hidden">
          <table
            className="w-full text-sm"
            aria-label="Archivo de documentos"
          >
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-2 font-medium">Familia</th>
                <th className="text-left p-2 font-medium">Tipo</th>
                <th className="text-left p-2 font-medium">Fecha</th>
                <th className="text-left p-2 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      <td className="p-2"><Skeleton className="h-4 w-full" /></td>
                      <td className="p-2"><Skeleton className="h-4 w-full" /></td>
                      <td className="p-2"><Skeleton className="h-4 w-full" /></td>
                      <td className="p-2"><Skeleton className="h-4 w-20" /></td>
                    </tr>
                  ))
                : rows.length === 0
                  ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="p-8 text-center text-muted-foreground"
                      >
                        Sin documentos en el archivo
                      </td>
                    </tr>
                  )
                  : rows.map((row) => {
                    const titular = row.families?.persons;
                    const nombreCompleto = titular
                      ? `${titular.nombre} ${titular.apellidos}`.trim()
                      : "—";
                    const fecha = row.created_at
                      ? new Date(row.created_at).toLocaleDateString("es-ES")
                      : "—";

                    return (
                      <tr key={row.id} className="border-t">
                        <td className="p-2">
                          #{row.families?.familia_numero} {nombreCompleto}
                        </td>
                        <td className="p-2">{tipoLabel(row.documento_tipo)}</td>
                        <td className="p-2">{fecha}</td>
                        <td className="p-2">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleVer(row.documento_url)}
                              aria-label="Ver"
                            >
                              <Eye className="h-3 w-3 mr-1" aria-hidden="true" />
                              Ver
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onReclassify(row.id, row.documento_tipo)}
                              aria-label="Reclasificar"
                            >
                              Reclasificar
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
              }
            </tbody>
          </table>
        </div>

        {/* Total count */}
        {!isLoading && (
          <div className="mt-2 text-xs text-muted-foreground text-right">
            {total} documentos
          </div>
        )}
      </CardContent>
    </Card>
  );
}
