/**
 * CheckinHistoryTable — Paginated check-in history for a person.
 * McKinsey/Colenusbaumer style: clean data table, direct labels, no decorative elements.
 * Shows: date, time, location, program, method, demo badge.
 */
import { ChevronLeft, ChevronRight, Loader2, AlertCircle, CalendarCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCheckinHistory } from "../hooks/useCheckinHistory";

const PROGRAMA_LABEL: Record<string, string> = {
  comedor: "Comedor Social",
  acompanamiento: "Acompañamiento",
  atencion_juridica: "Atención Jurídica",
  formacion: "Formación",
  familia: "Programa Familias",
  voluntariado: "Voluntariado",
};

const METODO_LABEL: Record<string, string> = {
  qr: "QR",
  manual: "Manual",
  conteo_anonimo: "Anónimo",
};

interface CheckinHistoryTableProps {
  personId: string;
}

export function CheckinHistoryTable({ personId }: CheckinHistoryTableProps) {
  const {
    rows,
    total,
    isLoading,
    isFetching,
    isError,
    refetch,
    currentPage,
    totalPages,
    nextPage,
    prevPage,
    offset,
    pageSize,
  } = useCheckinHistory(personId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10" aria-busy="true" aria-label="Cargando historial">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
        <AlertCircle className="h-6 w-6 text-destructive" />
        <p className="text-sm">No se pudo cargar el historial.</p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          Reintentar
        </Button>
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
        <CalendarCheck className="h-8 w-8 opacity-40" />
        <p className="text-sm">Sin asistencias registradas.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Table header info */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {total} asistencia{total !== 1 ? "s" : ""} registrada{total !== 1 ? "s" : ""}
          {isFetching && <span className="ml-2 text-primary">Actualizando…</span>}
        </p>
        {totalPages > 1 && (
          <p className="text-xs text-muted-foreground">
            Página {currentPage} de {totalPages}
          </p>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-md border border-border">
        <table
          className="w-full text-sm"
          role="table"
          aria-label="Historial de asistencia"
        >
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Fecha
              </th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Hora
              </th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">
                Sede
              </th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Programa
              </th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">
                Método
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors"
              >
                <td className="px-3 py-2.5 tabular-nums text-foreground">
                  {new Date(row.fecha + "T12:00:00Z").toLocaleDateString("es-ES", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                  {row.esDemo && (
                    <Badge variant="secondary" className="ml-1.5 text-[10px] px-1 py-0 h-4">
                      demo
                    </Badge>
                  )}
                </td>
                <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                  {row.hora}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground hidden sm:table-cell">
                  {row.sede}
                </td>
                <td className="px-3 py-2.5">
                  <span className="text-foreground">
                    {PROGRAMA_LABEL[row.programa] ?? row.programa}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground hidden md:table-cell">
                  {METODO_LABEL[row.metodo] ?? row.metodo}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-muted-foreground">
            {offset + 1}–{Math.min(offset + pageSize, total)} de {total}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={prevPage}
              disabled={currentPage === 1}
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={nextPage}
              disabled={currentPage === totalPages}
              aria-label="Página siguiente"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
