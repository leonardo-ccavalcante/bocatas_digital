/**
 * ResumenTrimestralModal.tsx — KPIs trimestrales.
 *
 * Inputs: year + quarter (1-4). Output: KPI summary + distribución table.
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
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
import { useResumenTrimestral } from "../hooks/useTemplatedReports";

const REDACT = [...HIGH_RISK_PII_FIELDS];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ResumenTrimestralModal({ open, onClose }: Props) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [quarter, setQuarter] = useState<1 | 2 | 3 | 4>(1);

  const { data, isLoading, error } = useResumenTrimestral({ year, quarter }, open);

  function handleExport() {
    if (!data) return;
    const rows = data.distribucionPorDistrito.map((d) => ({
      distrito: d.distrito,
      nuevas_familias: d.count,
    }));
    exportRowsAsCsv(rows, {
      filename: `bocatas_resumen_T${quarter}_${year}.csv`,
      redactFields: REDACT,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Resumen trimestral</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="space-y-1 col-span-2">
            <Label htmlFor="trim-year">Año</Label>
            <Input
              id="trim-year"
              type="number"
              min={2020}
              max={2099}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              aria-label="Año del informe"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="trim-quarter">Trimestre</Label>
            <Select
              value={String(quarter)}
              onValueChange={(v) => setQuarter(Number(v) as 1 | 2 | 3 | 4)}
            >
              <SelectTrigger id="trim-quarter" aria-label="Trimestre">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">T1 (Ene-Mar)</SelectItem>
                <SelectItem value="2">T2 (Abr-Jun)</SelectItem>
                <SelectItem value="3">T3 (Jul-Sep)</SelectItem>
                <SelectItem value="4">T4 (Oct-Dic)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        )}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            Error: {error instanceof Error ? error.message : String(error)}
          </p>
        )}

        {data && !isLoading && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">Nuevas familias</p>
                  <p className="text-3xl font-bold">{data.nuevasFamilias}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {data.periodo.from} → {data.periodo.to}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">Total entregas</p>
                  <p className="text-3xl font-bold">{data.totalEntregas}</p>
                </CardContent>
              </Card>
            </div>

            {data.distribucionPorDistrito.length > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Distribución por distrito</p>
                  <Button size="sm" variant="outline" onClick={handleExport}>
                    <Download className="mr-1 h-3 w-3" aria-hidden="true" />
                    CSV
                  </Button>
                </div>
                <div className="max-h-48 overflow-auto rounded-md border">
                  <Table aria-label="Distribución por distrito trimestral">
                    <TableHeader>
                      <TableRow>
                        <TableHead scope="col">Distrito</TableHead>
                        <TableHead scope="col">Nuevas familias</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.distribucionPorDistrito.map((d) => (
                        <TableRow key={d.distrito}>
                          <TableCell className="text-xs">{d.distrito}</TableCell>
                          <TableCell className="text-xs">{d.count}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
