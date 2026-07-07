import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRepartos, useDeleteReparto } from "../hooks/useReparto";

const ESTADO_VARIANT: Record<string, "secondary" | "default" | "outline"> = {
  borrador: "secondary",
  activa: "default",
  cerrada: "outline",
};

interface Props {
  programId: string;
  onSelect: (roundId: string) => void;
}

export function RepartoList({ programId, onSelect }: Props) {
  const { data, isLoading } = useRepartos(programId);
  const deleteRound = useDeleteReparto();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  if (isLoading) return <p className="text-sm text-muted-foreground">Cargando repartos…</p>;
  if (!data?.length) return <p className="text-sm text-muted-foreground">No hay repartos todavía.</p>;

  const roundToDelete = data.find((r) => r.id === pendingDeleteId);

  return (
    <>
      <ul className="space-y-2">
        {data.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{r.nombre}</p>
              <p className="text-xs text-muted-foreground">{r.fecha_inicio}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant={ESTADO_VARIANT[r.estado] ?? "secondary"}>{r.estado}</Badge>
              <Button variant="ghost" size="sm" onClick={() => onSelect(r.id)}>
                Abrir
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setPendingDeleteId(r.id)}
              >
                Eliminar
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <AlertDialog open={!!pendingDeleteId} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar reparto?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el reparto <strong>{roundToDelete?.nombre}</strong> de forma permanente.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingDeleteId) {
                  deleteRound.mutate({ round_id: pendingDeleteId });
                  setPendingDeleteId(null);
                }
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
