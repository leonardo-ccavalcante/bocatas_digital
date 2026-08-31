/**
 * DeletePersonButton — retirar una ficha (superadmin).
 *
 * Es un soft-delete: la ficha desaparece de la aplicación y de los listados de
 * programa, pero el registro sigue en la base y se puede restaurar desde
 * admin/soft-delete-recovery. Por eso el texto dice "retirar" y no "borrar".
 *
 * El servidor se niega si la persona tiene check-ins registrados: eso ya no es
 * un duplicado, es historia de servicio (server/routers/persons/update.ts).
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

interface DeletePersonButtonProps {
  personId: string;
  nombreCompleto: string;
}

export function DeletePersonButton({ personId, nombreCompleto }: DeletePersonButtonProps) {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const { mutateAsync: softDelete, isPending } = trpc.persons.softDelete.useMutation();

  const retirar = async () => {
    try {
      await softDelete({ id: personId });
      toast.success("Ficha retirada.");
      setOpen(false);
      navigate("/personas");
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Error desconocido";
      toast.error(mensaje);
      setOpen(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10">
          <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" /> Retirar ficha
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Retirar la ficha de {nombreCompleto}?</AlertDialogTitle>
          <AlertDialogDescription>
            Dejará de aparecer en el listado de personas y en los programas donde
            esté inscrita. No se borra de la base de datos: un superadmin puede
            restaurarla. Si la persona tiene check-ins registrados, no se
            retirará — en ese caso hay que fusionar las fichas, no eliminar una.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void retirar();
            }}
            disabled={isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Retirando...
              </>
            ) : (
              "Sí, retirar"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
