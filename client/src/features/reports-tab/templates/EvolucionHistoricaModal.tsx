/**
 * EvolucionHistoricaModal.tsx — Nuevas familias por mes (últimos N meses).
 *
 * Input: months (default 12, max 24). Output: month → count table + CSV.
 * No heavy chart library — plain table per bundle budget rule.
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useEvolucionHistorica } from "../hooks/useTemplatedReports";

const REDACT = [...HIGH_RISK_PII_FIELDS];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function EvolucionHistoricaModal({ open, onClose }: Props) {
  const [months, setMonths] = useState(12);

  const { data, isLoading, error } = useEvolucionHistorica({ months }, open);
  const buckets = data?.months ?? [];

  function handleExport() {
    exportRowsAsCsv(buckets, {
      filename: `bocatas_evolucion_${months}m.csv`,
      redactFields: REDACT,
    });
  }

  const maxCount = buckets.reduce((m, b) => Math.max(m, b.count), 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl" aria-labelledby="evolucion-title">
        <DialogHeader>
          <DialogTitle id="evolucion-title">Evolución histórica</DialogTitle>
        </DialogHeader>

        <div className="flex items-end gap-3 text-sm">
          <div className="space-y-1 w-32">
            <Label htmlFor="evol-months">Meses atrás</Label>
            <Input
              id="evol-months"
              type="number"
              min={1}
              max={24}
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
              aria-label="Número de meses"
            />
          </div>
          {buckets.length > 0 && (
            <Button size="sm" variant="outline" onClick={handleExport}>
              <Download className="mr-1 h-3 w-3" aria-hidden="true" />
              CSV
            </Button>
          )}
        </div>

        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        )}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            Error: {error instanceof Error ? error.message : String(error)}
          </p>
        )}

        {!isLoading && !error && buckets.length > 0 && (
          <div className="max-h-72 overflow-auto rounded-md border">
            <Table aria-label="Evolución histórica de familias">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Mes</TableHead>
                  <TableHead scope="col" className="text-right">
                    Nuevas familias
                  </TableHead>
                  <TableHead scope="col">Tendencia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {buckets.map((b) => {
                  const pct = maxCount > 0 ? Math.round((b.count / maxCount) * 100) : 0;
                  return (
                    <TableRow key={b.bucket}>
                      <TableCell className="text-xs font-medium">{b.bucket}</TableCell>
                      <TableCell className="text-xs text-right">{b.count}</TableCell>
                      <TableCell className="text-xs w-32">
                        <div
                          className="h-2 rounded-full bg-primary/70"
                          style={{ width: `${pct}%` }}
                          aria-label={`${pct}% del máximo`}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        {!isLoading && !error && buckets.length === 0 && data && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Sin datos en el período seleccionado.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
