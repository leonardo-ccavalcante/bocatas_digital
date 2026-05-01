import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export interface ImportHistory {
  id: string;
  created_by: string;
  status: "pending" | "completed" | "failed";
  total_rows: number;
  successful_rows: number;
  failed_rows: number;
  error_message?: string;
  created_at: string;
  completed_at?: string;
}

interface BulkImportHistoryTableProps {
  history: ImportHistory[];
  isLoading?: boolean;
  onRetry?: (id: string) => void;
}

export function BulkImportHistoryTable({
  history,
  isLoading = false,
  onRetry,
}: BulkImportHistoryTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-100 text-green-800">Completado</Badge>;
      case "failed":
        return <Badge className="bg-red-100 text-red-800">Fallido</Badge>;
      case "pending":
        return <Badge className="bg-yellow-100 text-yellow-800">Pendiente</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getSuccessRate = (successful: number, total: number) => {
    if (total === 0) return "0%";
    return `${Math.round((successful / total) * 100)}%`;
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <div className="text-gray-500">Cargando historial...</div>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="flex justify-center py-8">
        <div className="text-gray-500">No hay importaciones registradas</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Exitosos</TableHead>
            <TableHead className="text-right">Fallidos</TableHead>
            <TableHead className="text-right">Tasa Éxito</TableHead>
            <TableHead className="text-center">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {history.map((record) => (
            <div key={record.id}>
              <TableRow>
                <TableCell>
                  {format(new Date(record.created_at), "dd MMM yyyy HH:mm", {
                    locale: es,
                  })}
                </TableCell>
                <TableCell>{getStatusBadge(record.status)}</TableCell>
                <TableCell className="text-right">{record.total_rows}</TableCell>
                <TableCell className="text-right text-green-600 font-medium">
                  {record.successful_rows}
                </TableCell>
                <TableCell className="text-right text-red-600 font-medium">
                  {record.failed_rows}
                </TableCell>
                <TableCell className="text-right">
                  {getSuccessRate(record.successful_rows, record.total_rows)}
                </TableCell>
                <TableCell className="text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setExpandedId(
                        expandedId === record.id ? null : record.id
                      )
                    }
                  >
                    {expandedId === record.id ? "Ocultar" : "Detalles"}
                  </Button>
                </TableCell>
              </TableRow>

              {expandedId === record.id && (
                <TableRow>
                  <TableCell colSpan={7} className="bg-gray-50 p-4">
                    <div className="space-y-2">
                      {record.completed_at && (
                        <div>
                          <span className="font-medium">Completado:</span>{" "}
                          {format(
                            new Date(record.completed_at),
                            "dd MMM yyyy HH:mm:ss",
                            { locale: es }
                          )}
                        </div>
                      )}
                      {record.error_message && (
                        <div>
                          <span className="font-medium text-red-600">
                            Error:
                          </span>{" "}
                          {record.error_message}
                        </div>
                      )}
                      {record.status === "failed" && onRetry && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onRetry(record.id)}
                        >
                          Reintentar
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </div>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
