/**
 * FamiliasAtendidasModal.tsx — Familias atendidas por período.
 *
 * Inputs: date range (from/to). Outputs: table + CSV export.
 * Compliance: CSV redactFields includes high-risk PII list.
 * Query: { enabled: open } — fetches only when modal is visible.
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
import { useFamiliasAtendidas } from "../hooks/useTemplatedReports";

const REDACT = [...HIGH_RISK_PII_FIELDS];

function todayISO() {
  return new Date().toISOString().split("T")[0];
}
function monthStartISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function FamiliasAtendidasModal({ open, onClose }: Props) {
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());

  const { data, isLoading, error } = useFamiliasAtendidas({ from, to }, open);

  const rows = data?.rows ?? [];

  function handleExport() {
    const exportable = rows.map((r) => ({
      familia_numero: (r as { familia_numero: number }).familia_numero,
      estado: (r as { estado: string }).estado,
      num_adultos: (r as { num_adultos: number | null }).num_adultos ?? 0,
      num_menores_18: (r as { num_menores_18: number | null }).num_menores_18 ?? 0,
      distrito: (r as { distrito: string | null }).distrito ?? "",
      created_at: (r as { created_at: string }).created_at,
    }));
    exportRowsAsCsv(exportable, {
      filename: `bocatas_familias_atendidas_${from}_${to}.csv`,
      redactFields: REDACT,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl" aria-labelledby="fam-atendidas-title">
        <DialogHeader>
          <DialogTitle id="fam-atendidas-title">Familias atendidas</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="space-y-1">
            <Label htmlFor="fam-from">Desde</Label>
            <Input
              id="fam-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              aria-label="Fecha desde"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fam-to">Hasta</Label>
            <Input
              id="fam-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              aria-label="Fecha hasta"
            />
          </div>
        </div>

        {data && (
          <div className="flex items-center justify-between text-sm">
            <p className="text-muted-foreground">
              {data.meta.totalFamilias} familias · {data.meta.totalPersonas} personas
            </p>
            <Button size="sm" variant="outline" onClick={handleExport} disabled={rows.length === 0}>
              <Download className="mr-1 h-3 w-3" aria-hidden="true" />
              CSV
            </Button>
          </div>
        )}

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
            <Table aria-label="Familias atendidas">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">#</TableHead>
                  <TableHead scope="col">Titular</TableHead>
                  <TableHead scope="col">Estado</TableHead>
                  <TableHead scope="col">Personas</TableHead>
                  <TableHead scope="col">Distrito</TableHead>
                  <TableHead scope="col">Alta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const f = r as {
                    familia_numero: number;
                    estado: string;
                    num_adultos: number | null;
                    num_menores_18: number | null;
                    distrito: string | null;
                    created_at: string;
                    persons: { nombre: string; apellidos: string | null } | null;
                  };
                  return (
                    <TableRow key={f.familia_numero}>
                      <TableCell className="text-xs">#{f.familia_numero}</TableCell>
                      <TableCell className="text-xs">
                        {f.persons
                          ? `${f.persons.nombre} ${f.persons.apellidos ?? ""}`.trim()
                          : "—"}
                      </TableCell>
                      <TableCell className="text-xs capitalize">{f.estado}</TableCell>
                      <TableCell className="text-xs">
                        {(f.num_adultos ?? 0) + (f.num_menores_18 ?? 0)}
                      </TableCell>
                      <TableCell className="text-xs">{f.distrito ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        {new Date(f.created_at).toLocaleDateString("es-ES")}
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
            Sin familias en el período seleccionado.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
