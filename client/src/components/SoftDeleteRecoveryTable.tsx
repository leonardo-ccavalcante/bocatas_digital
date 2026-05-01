import React from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Loader2, RotateCcw } from "lucide-react";

interface DeletedRecord {
  id: string;
  deleted_at: string;
  updated_at: string;
  [key: string]: any;
}

interface SoftDeleteRecoveryTableProps {
  items: DeletedRecord[];
  type: "families" | "persons";
  onRestore: (id: string) => Promise<void>;
  isLoading: boolean;
}

export function SoftDeleteRecoveryTable({
  items,
  type,
  onRestore,
  isLoading,
}: SoftDeleteRecoveryTableProps) {
  const [restoring, setRestoring] = React.useState<string | null>(null);

  const handleRestore = async (id: string) => {
    setRestoring(id);
    try {
      await onRestore(id);
    } finally {
      setRestoring(null);
    }
  };

  const columns = type === "families"
    ? ["Familia #", "Estado", "Eliminado", "Acciones"]
    : ["Nombre", "Eliminado", "Acciones"];

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col}>{col}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="text-center py-8 text-muted-foreground"
              >
                No hay registros eliminados
              </TableCell>
            </TableRow>
          ) : (
            items.map((item) => (
              <TableRow key={item.id}>
                {type === "families" ? (
                  <>
                    <TableCell>{item.familia_numero}</TableCell>
                    <TableCell>{item.estado}</TableCell>
                    <TableCell>
                      {format(new Date(item.deleted_at), "PPpp", { locale: es })}
                    </TableCell>
                  </>
                ) : (
                  <>
                    <TableCell>{item.nombre}</TableCell>
                    <TableCell>
                      {format(new Date(item.deleted_at), "PPpp", { locale: es })}
                    </TableCell>
                  </>
                )}
                <TableCell>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRestore(item.id)}
                    disabled={restoring === item.id || isLoading}
                  >
                    {restoring === item.id ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Restaurando...
                      </>
                    ) : (
                      <>
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Restaurar
                      </>
                    )}
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
