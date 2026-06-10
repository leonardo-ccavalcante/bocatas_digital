/**
 * PreviewPane.tsx — Renders the execute result and CSV export button.
 *
 * Compliance: always passes HIGH_RISK_PII_FIELDS as redactFields.
 * The export button is disabled when there are no rows.
 */

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, AlertCircle } from "lucide-react";
import { HIGH_RISK_PII_FIELDS } from "@shared/reports/entities";
import { exportRowsAsCsv } from "../utils/exportCsv";

interface PreviewPaneProps {
  rows: Record<string, unknown>[] | undefined;
  total: number | undefined;
  isLoading: boolean;
  // TanStack Query + tRPC return a TRPCClientErrorLike which extends the Error shape
  // but is not exactly `Error`. Use the wider `unknown` and narrow at render time.
  error: unknown;
  filename?: string;
  /**
   * Number of groups suppressed by k-anonymity. When > 0 an amber banner is
   * shown, matching the wording in IrpfDemograficoModal.
   */
  suppressedCount?: number;
}

const REDACT_FIELDS = [...HIGH_RISK_PII_FIELDS];

export function PreviewPane({
  rows,
  total,
  isLoading,
  error,
  filename = "bocatas_informe.csv",
  suppressedCount = 0,
}: PreviewPaneProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return (
      <div
        className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        role="alert"
      >
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        Error al ejecutar la consulta: {msg}
      </div>
    );
  }

  if (!rows) {
    return (
      <p className="text-sm text-muted-foreground">
        Configure los filtros y pulse Ejecutar para ver resultados.
      </p>
    );
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin resultados para esta consulta.</p>;
  }

  const headers = Object.keys(rows[0]);

  function handleExport() {
    exportRowsAsCsv(rows as Record<string, unknown>[], {
      filename,
      redactFields: REDACT_FIELDS,
    });
  }

  return (
    <div className="space-y-3">
      {suppressedCount > 0 && (
        <div
          role="alert"
          className="rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
          Algunas filas se ocultaron por privacidad (k-anonimato).
        </div>
      )}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {rows.length} filas{total !== undefined && total !== rows.length ? ` de ${total}` : ""}
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={handleExport}
          disabled={rows.length === 0}
          aria-label="Exportar a CSV"
        >
          <Download className="mr-1 h-3 w-3" aria-hidden="true" />
          CSV
        </Button>
      </div>
      <div className="max-h-64 overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {headers.map((h) => (
                <TableHead key={h} scope="col" className="whitespace-nowrap text-xs">
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, 100).map((row, i) => (
              <TableRow key={i}>
                {headers.map((h) => (
                  <TableCell key={h} className="text-xs">
                    {String(row[h] ?? "")}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
