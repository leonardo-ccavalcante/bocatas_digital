/**
 * DocumentosFaltantesModal.tsx — Familias con documentación requerida sin subir.
 *
 * Input: programaId (UUID). Output: list with missing-doc breakdown + CSV.
 * Query: { enabled: open && !!programaId }.
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Download } from "lucide-react";
import { HIGH_RISK_PII_FIELDS } from "@shared/reports/entities";
import { exportRowsAsCsv } from "../utils/exportCsv";
import { useDocumentosFaltantes } from "../hooks/useTemplatedReports";

const REDACT = [...HIGH_RISK_PII_FIELDS];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Props {
  open: boolean;
  onClose: () => void;
  programaId?: string;
}

export function DocumentosFaltantesModal({ open, onClose, programaId: initialProgramaId }: Props) {
  const [programaId, setProgramaId] = useState(initialProgramaId ?? "");

  const isValidUuid = UUID_RE.test(programaId);
  const { data, isLoading, error } = useDocumentosFaltantes(
    { programaId },
    open && isValidUuid,
  );
  const rows = data?.rows ?? [];

  function handleExport() {
    const exportable = rows.map((r) => ({
      familia_numero: r.familia_numero,
      documentos_faltantes: r.missing.join(", "),
    }));
    exportRowsAsCsv(exportable, {
      filename: `bocatas_documentos_faltantes.csv`,
      redactFields: REDACT,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl" aria-labelledby="docs-faltantes-title">
        <DialogHeader>
          <DialogTitle id="docs-faltantes-title">Documentos faltantes</DialogTitle>
        </DialogHeader>

        <div className="flex items-end gap-3 text-sm">
          {!initialProgramaId && (
            <div className="space-y-1 flex-1">
              <Label htmlFor="programa-id">ID de programa (UUID)</Label>
              <Input
                id="programa-id"
                value={programaId}
                onChange={(e) => setProgramaId(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                aria-label="ID del programa"
              />
              {programaId && !isValidUuid && (
                <p className="text-xs text-destructive">UUID inválido</p>
              )}
            </div>
          )}
          {rows.length > 0 && (
            <Button size="sm" variant="outline" onClick={handleExport}>
              <Download className="mr-1 h-3 w-3" aria-hidden="true" />
              CSV
            </Button>
          )}
        </div>

        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        )}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            Error: {error instanceof Error ? error.message : String(error)}
          </p>
        )}

        {!isLoading && !error && rows.length > 0 && (
          <div className="max-h-72 overflow-auto rounded-md border">
            <Table aria-label="Documentos faltantes">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">#</TableHead>
                  <TableHead scope="col">Documentos faltantes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.family_id}>
                    <TableCell className="text-xs">#{r.familia_numero}</TableCell>
                    <TableCell className="text-xs">
                      <div className="flex flex-wrap gap-1">
                        {r.missing.map((slug) => (
                          <Badge key={slug} variant="destructive" className="text-xs">
                            {slug}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {!isLoading && !error && rows.length === 0 && data && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Toda la documentación requerida está al día.
          </p>
        )}
        {!isValidUuid && programaId.length > 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Introduce un UUID de programa válido para generar el informe.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
