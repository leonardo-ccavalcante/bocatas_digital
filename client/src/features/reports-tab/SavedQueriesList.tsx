/**
 * SavedQueriesList.tsx — List shared + own saved queries, run + delete.
 *
 * - Shows shared badge on queries where is_shared=true
 * - Delete button only appears for queries the current user owns
 * - onRun is called with the spec_json so CustomQueryBuilder can pre-load it
 *
 * Accessibility: table with scope headers, delete button has aria-label.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trash2, Play } from "lucide-react";
import { trpc } from "@/lib/trpc";
import type { SavedQuerySpec } from "@shared/reports/savedQuerySpec";

interface SavedQuery {
  id: string;
  nombre: string;
  descripcion: string | null;
  is_shared: boolean;
  user_id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  spec_json: any;
  created_at: string;
  programa_id: string | null;
}

interface SavedQueriesListProps {
  currentUserId: string;
  onRun: (spec: SavedQuerySpec) => void;
  programaId?: string;
}

export function SavedQueriesList({
  currentUserId,
  onRun,
  programaId,
}: SavedQueriesListProps) {
  const { data, isLoading } = trpc.reports.list.useQuery(
    programaId ? { programaId } : undefined,
  );

  const deleteMutation = trpc.reports.delete.useMutation();

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full animate-pulse" />
        ))}
      </div>
    );
  }

  const queries = (data as SavedQuery[] | undefined) ?? [];

  if (queries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        Sin consultas guardadas
      </p>
    );
  }

  function handleDelete(id: string) {
    deleteMutation.mutate({ id });
  }

  function handleRun(q: SavedQuery) {
    onRun(q.spec_json as SavedQuerySpec);
  }

  return (
    <div className="overflow-auto rounded-md border">
      <Table aria-label="Consultas guardadas">
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Nombre</TableHead>
            <TableHead scope="col">Tipo</TableHead>
            <TableHead scope="col">Creada</TableHead>
            <TableHead scope="col" className="w-[120px]">
              Acciones
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {queries.map((q) => {
            const isOwn = q.user_id === currentUserId;
            const date = new Date(q.created_at).toLocaleDateString("es-ES", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            });
            return (
              <TableRow key={q.id}>
                <TableCell className="text-sm font-medium">
                  <div className="flex items-center gap-2">
                    {q.nombre}
                    {q.is_shared && (
                      <Badge variant="secondary" className="text-xs">
                        Compartida
                      </Badge>
                    )}
                  </div>
                  {q.descripcion && (
                    <p className="text-xs text-muted-foreground mt-0.5">{q.descripcion}</p>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {String((q.spec_json as { entity?: string })?.entity ?? "—")}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{date}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRun(q)}
                      aria-label="Ejecutar"
                    >
                      <Play className="h-3 w-3" aria-hidden="true" />
                      Ejecutar
                    </Button>
                    {isOwn && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(q.id)}
                        disabled={deleteMutation.isPending}
                        aria-label="Eliminar"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" aria-hidden="true" />
                        Eliminar
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
