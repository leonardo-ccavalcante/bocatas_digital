/**
 * DistribucionPorDistritoModal.tsx — Familias activas por distrito de Madrid.
 *
 * Input: estado filter. Output: sorted table + CSV.
 * Query: { enabled: open }.
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { exportRowsAsCsv, labelSuppressedCounts } from "../utils/exportCsv";
import { useDistribucionPorDistrito } from "../hooks/useTemplatedReports";

const REDACT = [...HIGH_RISK_PII_FIELDS];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function DistribucionPorDistritoModal({ open, onClose }: Props) {
  const [estado, setEstado] = useState<"activa" | "all">("activa");

  const { data, isLoading, error } = useDistribucionPorDistrito({ estado }, open);
  const rows = data?.rows ?? [];

  function handleExport() {
    // Suppressed counts (null) export as the explicit "<3" marker, not a blank.
    exportRowsAsCsv(labelSuppressedCounts(rows), {
      filename: `bocatas_distribucion_distrito.csv`,
      redactFields: REDACT,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Distribución por distrito</DialogTitle>
        </DialogHeader>

        <div className="flex items-end gap-3 text-sm">
          <div className="space-y-1 w-48">
            <Label htmlFor="dist-estado">Estado de familia</Label>
            <Select value={estado} onValueChange={(v) => setEstado(v as "activa" | "all")}>
              <SelectTrigger id="dist-estado" aria-label="Filtrar por estado">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="activa">Solo activas</SelectItem>
                <SelectItem value="all">Todas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {rows.length > 0 && (
            <Button size="sm" variant="outline" onClick={handleExport}>
              <Download className="mr-1 h-3 w-3" aria-hidden="true" />
              CSV
            </Button>
          )}
        </div>

        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
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
            <Table aria-label="Distribución por distrito">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Distrito</TableHead>
                  <TableHead scope="col" className="text-right">
                    Familias
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.distrito}>
                    <TableCell className="text-xs">{r.distrito}</TableCell>
                    <TableCell
                      className="text-xs text-right font-medium"
                      title={r.count === null ? "Menos de 3 — ocultado por privacidad" : undefined}
                    >
                      {r.count === null ? "<3" : r.count}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {!isLoading && !error && rows.length === 0 && data && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Sin datos disponibles.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
