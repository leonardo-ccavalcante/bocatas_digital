/**
 * FamiliasEnRiesgoModal.tsx — Familias con al menos un CM red flag.
 *
 * Input: estado filter (activa | all). Output: list + CSV.
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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Download, AlertCircle } from "lucide-react";
import { HIGH_RISK_PII_FIELDS } from "@shared/reports/entities";
import { exportRowsAsCsv } from "../utils/exportCsv";
import { useFamiliasEnRiesgo } from "../hooks/useTemplatedReports";

const REDACT = [...HIGH_RISK_PII_FIELDS];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function FamiliasEnRiesgoModal({ open, onClose }: Props) {
  const [estado, setEstado] = useState<"activa" | "all">("activa");

  const { data, isLoading, error } = useFamiliasEnRiesgo({ estado }, open);
  const rows = data?.rows ?? [];

  function handleExport() {
    const exportable = rows.map((r) => {
      const f = r as {
        familia_numero: number;
        estado: string;
        distrito: string | null;
        persons: { nombre: string; apellidos: string | null } | null;
      };
      return {
        familia_numero: f.familia_numero,
        estado: f.estado,
        distrito: f.distrito ?? "",
        titular: f.persons ? `${f.persons.nombre} ${f.persons.apellidos ?? ""}`.trim() : "",
      };
    });
    exportRowsAsCsv(exportable, {
      filename: `bocatas_familias_en_riesgo.csv`,
      redactFields: REDACT,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl" aria-labelledby="riesgo-title">
        <DialogHeader>
          <DialogTitle id="riesgo-title" className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
            Familias en riesgo
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-end gap-3 text-sm">
          <div className="space-y-1 w-48">
            <Label htmlFor="riesgo-estado">Estado de familia</Label>
            <Select value={estado} onValueChange={(v) => setEstado(v as "activa" | "all")}>
              <SelectTrigger id="riesgo-estado" aria-label="Filtrar por estado">
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

        {data && (
          <p className="text-sm text-muted-foreground">
            {data.total} familia{data.total !== 1 ? "s" : ""} con indicadores en riesgo
          </p>
        )}

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
            <Table aria-label="Familias en riesgo">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">#</TableHead>
                  <TableHead scope="col">Titular</TableHead>
                  <TableHead scope="col">Distrito</TableHead>
                  <TableHead scope="col">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const f = r as {
                    familia_numero: number;
                    estado: string;
                    distrito: string | null;
                    persons: { nombre: string; apellidos: string | null } | null;
                  };
                  return (
                    <TableRow key={f.familia_numero}>
                      <TableCell className="text-xs">#{f.familia_numero}</TableCell>
                      <TableCell className="text-xs">
                        {f.persons ? `${f.persons.nombre} ${f.persons.apellidos ?? ""}`.trim() : "—"}
                      </TableCell>
                      <TableCell className="text-xs">{f.distrito ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        <Badge variant={f.estado === "activa" ? "default" : "secondary"}>
                          {f.estado}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        {!isLoading && !error && rows.length === 0 && data && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Sin familias en riesgo. ¡Todo en orden!
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
