/**
 * IrpfDemograficoModal.tsx — Desglose demográfico IRPF anual.
 *
 * Dimensions: Edad / Género / Estudios / Empleo / Nacionalidad (marginals).
 * Secondary: collapsible cross-tab (edad × género × estudios × empleo × pais).
 * K-anonymity: cells with count < 3 are suppressed (null → "—").
 * CSV: two exports — marginales + cruzado — both cast-free.
 * Query: { enabled: open } — fetches only when modal is visible.
 *
 * Architecture (F-B): NO imports from server/. Types derived from hook return.
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { paisLabel } from "../utils/paisLabel";
import { irpfEstudiosLabel, irpfLaboralLabel, irpfColectivoLabel } from "../utils/irpfLabels";
import { useIrpfDemografico } from "../hooks/useTemplatedReports";

// ── Types derived from hook — NO server import (F-B) ─────────────────────────

type IrpfData = NonNullable<ReturnType<typeof useIrpfDemografico>["data"]>;
type MarginalRow = IrpfData["marginals"]["age"][number];

/** Type-predicate: narrows count from number|null to number, enabling cast-free CSV maps. */
function isVisible<T extends { count: number | null }>(r: T): r is T & { count: number } {
  return r.count !== null;
}

const REDACT = [...HIGH_RISK_PII_FIELDS];

// ── MarginalTable subcomponent ────────────────────────────────────────────────

interface MarginalTableProps {
  title: string;
  rows: MarginalRow[];
  labelFn?: (key: string) => string;
}

function MarginalTable({ title, rows, labelFn }: MarginalTableProps) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {title}
      </p>
      <div className="rounded-md border">
        <Table aria-label={`Distribución por ${title}`}>
          <TableHeader>
            <TableRow>
              <TableHead scope="col" className="text-xs py-1">
                Valor
              </TableHead>
              <TableHead scope="col" className="text-xs py-1 text-right">
                N
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.key}>
                <TableCell className="text-xs py-1">
                  {labelFn !== undefined ? labelFn(r.key) : r.key}
                </TableCell>
                <TableCell className="text-xs py-1 text-right">
                  {r.count === null ? "—" : r.count}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
}

export function IrpfDemograficoModal({ open, onClose }: Props) {
  const [year, setYear] = useState(new Date().getFullYear());

  const { data, isLoading, error } = useIrpfDemografico({ year }, open);

  function handleExportMarginals() {
    if (!data) return;
    const dims: { title: string; key: keyof IrpfData["marginals"]; labelFn?: (k: string) => string }[] = [
      { title: "Edad", key: "age" },
      { title: "Género", key: "genero" },
      { title: "Estudios", key: "estudios", labelFn: irpfEstudiosLabel },
      { title: "Empleo", key: "laboral", labelFn: irpfLaboralLabel },
      { title: "Nacionalidad", key: "pais", labelFn: paisLabel },
      { title: "Colectivo", key: "colectivo", labelFn: irpfColectivoLabel },
    ];
    const rows = dims.flatMap(({ title, key, labelFn }) =>
      data.marginals[key]
        .filter(isVisible)
        .map((r) => ({
          dimension: title,
          valor: labelFn ? labelFn(r.key) : r.key,
          n: r.count,
        })),
    );
    exportRowsAsCsv(rows, {
      filename: `irpf_marginales_${year}.csv`,
      redactFields: REDACT,
    });
  }

  function handleExportCrossTab() {
    if (!data) return;
    const rows = data.crossTab
      .filter(isVisible)
      .map((r) => ({
        edad: r.age_bracket,
        genero: r.genero,
        estudios: r.nivel_estudios,
        empleo: r.situacion_laboral,
        pais: paisLabel(r.pais_origen),
        n: r.count,
      }));
    exportRowsAsCsv(rows, {
      filename: `irpf_cruzado_${year}.csv`,
      redactFields: REDACT,
    });
  }

  const showSuppression =
    data !== undefined &&
    ((data.totalSuppressed ?? 0) > 0 || (data.totalSuppressedMarginal ?? 0) > 0);

  const isEmpty = data !== undefined && !isLoading && data.totalMiembros === 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>IRPF Demográfico</DialogTitle>
          <DialogDescription className="sr-only">
            Informe demográfico anual para justificación de subvenciones IRPF.
          </DialogDescription>
        </DialogHeader>

        {/* Year control */}
        <div className="flex items-end gap-3 text-sm">
          <div className="space-y-1 w-32">
            <Label htmlFor="irpf-year">Año fiscal</Label>
            <Input
              id="irpf-year"
              type="number"
              min={2020}
              max={2099}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              aria-label="Año fiscal"
            />
          </div>
          {data && !isEmpty && (
            <>
              <Button size="sm" variant="outline" onClick={handleExportMarginals}>
                <Download className="mr-1 h-3 w-3" aria-hidden="true" />
                CSV (marginales)
              </Button>
              <Button size="sm" variant="outline" onClick={handleExportCrossTab}>
                <Download className="mr-1 h-3 w-3" aria-hidden="true" />
                CSV (cruzado)
              </Button>
            </>
          )}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            Error: {error instanceof Error ? error.message : String(error)}
          </p>
        )}

        {/* Empty state */}
        {isEmpty && (
          <p className="text-sm text-muted-foreground text-center py-6">
            Sin miembros activos para {year}.
          </p>
        )}

        {/* Suppression banner */}
        {showSuppression && (
          <div
            role="alert"
            className="rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-800"
          >
            Algunas celdas marcadas con «—» contienen menos de 3 personas y se
            han ocultado por privacidad (k-anonimato). Estas celdas también se
            omiten del CSV.
          </div>
        )}

        {/* KPI */}
        {data && !isLoading && !isEmpty && (
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{data.totalMiembros}</span>{" "}
            miembros activos
          </p>
        )}

        {/* 5 marginal tables */}
        {data && !isLoading && !isEmpty && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <MarginalTable title="Edad" rows={data.marginals.age} />
            <MarginalTable title="Género" rows={data.marginals.genero} />
            <MarginalTable title="Estudios" rows={data.marginals.estudios} labelFn={irpfEstudiosLabel} />
            <MarginalTable title="Empleo" rows={data.marginals.laboral} labelFn={irpfLaboralLabel} />
            <MarginalTable title="Nacionalidad" rows={data.marginals.pais} labelFn={paisLabel} />
            <MarginalTable title="Colectivo" rows={data.marginals.colectivo} labelFn={irpfColectivoLabel} />
          </div>
        )}

        {/* Collapsible cross-tab */}
        {data && !isLoading && !isEmpty && data.crossTab.length > 0 && (
          <details className="rounded-md border">
            <summary className="cursor-pointer px-3 py-2 text-xs font-medium select-none">
              Desglose cruzado (edad × género × estudios × empleo × nacionalidad)
            </summary>
            <div className="max-h-60 overflow-auto">
              <Table aria-label="Desglose cruzado demográfico">
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col" className="text-xs">Edad</TableHead>
                    <TableHead scope="col" className="text-xs">Género</TableHead>
                    <TableHead scope="col" className="text-xs">Estudios</TableHead>
                    <TableHead scope="col" className="text-xs">Empleo</TableHead>
                    <TableHead scope="col" className="text-xs">País</TableHead>
                    <TableHead scope="col" className="text-xs text-right">N</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.crossTab.map((r) => (
                    <TableRow key={`${r.age_bracket}|${r.genero}|${r.nivel_estudios}|${r.situacion_laboral}|${r.pais_origen}`}>
                      <TableCell className="text-xs">{r.age_bracket}</TableCell>
                      <TableCell className="text-xs">{r.genero}</TableCell>
                      <TableCell className="text-xs">{irpfEstudiosLabel(r.nivel_estudios)}</TableCell>
                      <TableCell className="text-xs">{irpfLaboralLabel(r.situacion_laboral)}</TableCell>
                      <TableCell className="text-xs">{paisLabel(r.pais_origen)}</TableCell>
                      <TableCell className="text-xs text-right">
                        {r.count === null ? "—" : r.count}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </details>
        )}
      </DialogContent>
    </Dialog>
  );
}
