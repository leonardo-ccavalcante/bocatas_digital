/**
 * PadronPorVencerModal.tsx — Familias cuyo padrón vence próximamente.
 *
 * Input: daysAhead (default 30). Output: table + CSV.
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
import { usePadronPorVencer } from "../hooks/useTemplatedReports";

const REDACT = [...HIGH_RISK_PII_FIELDS];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function PadronPorVencerModal({ open, onClose }: Props) {
  const [daysAhead, setDaysAhead] = useState(30);

  const { data, isLoading, error } = usePadronPorVencer({ daysAhead }, open);

  type PadronRow = {
    familia_numero: number;
    estado: string;
    distrito: string | null;
    padron_recibido_fecha: string | null;
    persons: { nombre: string; apellidos: string | null; telefono: string | null } | null;
  };

  const rows = ((data?.rows ?? []) as unknown[]).map((r) => r as PadronRow);

  function handleExport() {
    const exportable = rows.map((f) => {
      return {
        familia_numero: f.familia_numero,
        estado: f.estado,
        distrito: f.distrito ?? "",
        padron_recibido_fecha: f.padron_recibido_fecha ?? "",
        titular: f.persons ? `${f.persons.nombre} ${f.persons.apellidos ?? ""}`.trim() : "",
        telefono: f.persons?.telefono ?? "",
      };
    });
    exportRowsAsCsv(exportable, {
      filename: `bocatas_padron_por_vencer_${daysAhead}d.csv`,
      redactFields: REDACT,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Padrón por vencer</DialogTitle>
        </DialogHeader>

        <div className="flex items-end gap-3 text-sm">
          <div className="space-y-1 w-40">
            <Label htmlFor="days-ahead">Próximos días</Label>
            <Input
              id="days-ahead"
              type="number"
              min={1}
              max={365}
              value={daysAhead}
              onChange={(e) => setDaysAhead(Number(e.target.value))}
              aria-label="Días de anticipación"
            />
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
            <Table aria-label="Padrón por vencer">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">#</TableHead>
                  <TableHead scope="col">Titular</TableHead>
                  <TableHead scope="col">Distrito</TableHead>
                  <TableHead scope="col">Fecha padrón</TableHead>
                  <TableHead scope="col">Teléfono</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((f) => (
                  <TableRow key={f.familia_numero}>
                    <TableCell className="text-xs">#{f.familia_numero}</TableCell>
                    <TableCell className="text-xs">
                      {f.persons ? `${f.persons.nombre} ${f.persons.apellidos ?? ""}`.trim() : "—"}
                    </TableCell>
                    <TableCell className="text-xs">{f.distrito ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {f.padron_recibido_fecha
                        ? new Date(f.padron_recibido_fecha).toLocaleDateString("es-ES")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs">{f.persons?.telefono ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {!isLoading && !error && rows.length === 0 && data && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Sin padrón próximo a vencer en los próximos {daysAhead} días.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
