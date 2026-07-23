/**
 * ListadoMensual.tsx — monthly enrollment list for 'continuo' programs.
 * Replaces Notion's hand-built "26/1 Comedor" monthly databases.
 * ADR-0013: monthly lists are derived queries, not separate nodes.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Printer } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { ESTADO_LABELS } from "@shared/programEstados";

interface ListadoMensualProps {
  programId: string;
  programName: string;
}

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function currentYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function ListadoMensual({ programId, programName }: ListadoMensualProps) {
  const { year: initYear, month: initMonth } = currentYearMonth();
  const [year, setYear] = useState(initYear);
  const [month, setMonth] = useState(initMonth);

  const { data, isLoading } = trpc.programs.getListadoMensual.useQuery(
    { programId, year, month },
    { staleTime: 60_000, enabled: !!programId }
  );

  const personas = data?.personas ?? [];
  const totales = data?.totales;

  const yearOptions = Array.from({ length: 5 }, (_, i) => initYear - i);

  function handlePrint() {
    window.print();
  }

  return (
    <section aria-label={`Listado mensual de ${programName}`} className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-h3 text-foreground">Listado mensual</h2>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Month selector */}
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="text-sm border border-border rounded-lg px-2 py-1.5 bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
            aria-label="Seleccionar mes"
          >
            {MESES.map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>
          {/* Year selector */}
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="text-sm border border-border rounded-lg px-2 py-1.5 bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
            aria-label="Seleccionar año"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            aria-label="Imprimir listado mensual"
          >
            <Printer className="w-4 h-4 mr-1" aria-hidden="true" />
            Imprimir
          </Button>
        </div>
      </div>

      {/* Totals header */}
      {totales && (
        <div className="flex flex-wrap gap-4 p-3 rounded-xl bg-muted/40 text-sm">
          <span>
            <strong>{totales.inscritos}</strong> inscrito{totales.inscritos !== 1 ? "s" : ""}
          </span>
          <span>
            <strong>{totales.asistieron}</strong> con asistencia
          </span>
          {totales.asistencias_anonimas > 0 && (
            <span className="text-muted-foreground">
              +{totales.asistencias_anonimas} anónima{totales.asistencias_anonimas !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border overflow-x-auto print:border-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Apellidos, nombre</TableHead>
              <TableHead className="hidden sm:table-cell">Estado</TableHead>
              <TableHead className="text-right">Asistencias</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                  Cargando...
                </TableCell>
              </TableRow>
            ) : personas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                  Sin inscripciones en {MESES[month - 1]} {year}
                </TableCell>
              </TableRow>
            ) : (
              personas.map((p) => (
                <TableRow key={p.person_id}>
                  <TableCell className="font-medium text-sm">
                    {p.apellidos}, {p.nombre}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                    {ESTADO_LABELS[p.estado as keyof typeof ESTADO_LABELS] ?? p.estado}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {p.asistencias}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
