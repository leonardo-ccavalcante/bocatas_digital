import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertCircle } from "lucide-react";

export interface DeliveryRow {
  familia_numero: string;
  persona_recibio?: string;
  frutas_hortalizas_cantidad?: number;
  frutas_hortalizas_unidad?: string;
  carne_cantidad?: number;
  carne_unidad?: string;
  notas?: string;
  ocr_row_confidence?: number;
}

interface DeliveryPreviewTableProps {
  rows: DeliveryRow[];
  confidenceThreshold?: number;
}

/**
 * Read-only preview table for OCR-extracted delivery records
 * Shows all extracted data with confidence indicators
 */
export function DeliveryPreviewTable({
  rows,
  confidenceThreshold = 80,
}: DeliveryPreviewTableProps) {
  if (rows.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No delivery records to preview
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted">
            <TableHead className="w-24">Familia</TableHead>
            <TableHead className="w-32">Recibió</TableHead>
            <TableHead className="w-20">Frutas/Hortalizas</TableHead>
            <TableHead className="w-16">Unidad</TableHead>
            <TableHead className="w-20">Carne</TableHead>
            <TableHead className="w-16">Unidad</TableHead>
            <TableHead className="w-32">Notas</TableHead>
            <TableHead className="w-20">Confianza</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, idx) => {
            const isLowConfidence =
              row.ocr_row_confidence !== undefined &&
              row.ocr_row_confidence < confidenceThreshold;

            return (
              <TableRow
                key={idx}
                className={isLowConfidence ? "bg-yellow-50" : ""}
              >
                <TableCell className="font-medium text-sm">
                  {row.familia_numero}
                </TableCell>
                <TableCell className="text-sm">
                  {row.persona_recibio || "-"}
                </TableCell>
                <TableCell className="text-sm">
                  {row.frutas_hortalizas_cantidad || "-"}
                </TableCell>
                <TableCell className="text-sm">
                  {row.frutas_hortalizas_unidad || "-"}
                </TableCell>
                <TableCell className="text-sm">
                  {row.carne_cantidad || "-"}
                </TableCell>
                <TableCell className="text-sm">
                  {row.carne_unidad || "-"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground truncate">
                  {row.notas || "-"}
                </TableCell>
                <TableCell className="text-sm">
                  {isLowConfidence ? (
                    <div className="flex items-center gap-1">
                      <AlertCircle className="w-4 h-4 text-yellow-600" />
                      <Badge variant="outline" className="text-xs">
                        {row.ocr_row_confidence}%
                      </Badge>
                    </div>
                  ) : (
                    <Badge variant="secondary" className="text-xs">
                      {row.ocr_row_confidence}%
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
