/**
 * RetirarFichaMenu — el `⋯` de la ficha. Su único ítem retira la ficha.
 *
 * Antes era un botón «Retirar ficha» en la MISMA fila, con el mismo tamaño y el
 * mismo alcance que Editar / QR / Consentimientos. La única barrera era un
 * diálogo cuyo botón de confirmar cuesta exactamente lo mismo que el de
 * cancelar: un clic. Un resbalón sobre el cuarto botón y otro sobre «Sí,
 * retirar» sacaba a una persona del listado y de todos sus programas.
 *
 * Ahora hacen falta dos gestos deliberados y un dato que sólo se obtiene
 * MIRANDO de quién es la ficha: abrir el menú y escribir el nombre completo.
 *
 * Se escribe el nombre y no una palabra fija («RETIRAR»): una palabra fija se
 * teclea de memoria, y en una pantalla donde todas las fichas se parecen, el
 * error a evitar no es retirar sin querer — es retirar la ficha EQUIVOCADA. El
 * nombre es lo único que distingue una de otra.
 *
 * Se comparan sin tildes ni mayúsculas: la fricción tiene que ser deliberación,
 * no un examen de mecanografía en un teclado de móvil.
 *
 * Sigue siendo un soft-delete: la ficha desaparece de la aplicación y de los
 * listados de programa, pero el registro sigue en la base y se puede restaurar
 * desde admin/soft-delete-recovery. Por eso el texto dice "retirar", no
 * "borrar". El servidor además se niega si la persona tiene check-ins
 * registrados: eso ya no es un duplicado, es historia de servicio
 * (server/routers/persons/update.ts).
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Loader2, MoreHorizontal, Trash2 } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";

interface RetirarFichaMenuProps {
  personId: string;
  nombreCompleto: string;
}

/** Sin tildes, sin dobles espacios, sin mayúsculas. */
function normalizar(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function RetirarFichaMenu({ personId, nombreCompleto }: RetirarFichaMenuProps) {
  const [, navigate] = useLocation();
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [confirmacion, setConfirmacion] = useState("");
  const { mutateAsync: softDelete, isPending } = trpc.persons.softDelete.useMutation();

  // Un nombre vacío jamás debe habilitar el botón: sin este guard, una ficha sin
  // nombre se retiraría con el campo en blanco — la puerta abierta otra vez.
  const nombreEsperado = normalizar(nombreCompleto);
  const coincide = nombreEsperado !== "" && normalizar(confirmacion) === nombreEsperado;

  const abrirDialogo = () => {
    setConfirmacion("");
    setDialogoAbierto(true);
  };

  const retirar = async () => {
    if (!coincide) return;
    try {
      await softDelete({ id: personId });
      toast.success("Ficha retirada.");
      setDialogoAbierto(false);
      navigate("/personas");
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Error desconocido";
      toast.error(mensaje);
      setDialogoAbierto(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Más acciones"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[#C41230] text-[#C41230] transition-colors hover:bg-[#C41230]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </DropdownMenuTrigger>
        {/* h-11 por ítem: el pulgar, no el cursor. */}
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            className="h-11 text-destructive focus:text-destructive"
            // El menú se desmonta al elegir el ítem: si el diálogo viviera aquí
            // dentro, se iría con él. Vive fuera y sólo se le enciende el estado.
            onSelect={abrirDialogo}
          >
            <Trash2 aria-hidden="true" /> Retirar ficha…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={dialogoAbierto}
        onOpenChange={(abierto) => {
          setDialogoAbierto(abierto);
          if (!abierto) setConfirmacion("");
        }}
      >
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

          <div className="space-y-2">
            <Label htmlFor="confirmar-retirada" className="text-body-sm">
              Para confirmar, escribe{" "}
              <span className="font-semibold text-foreground">{nombreCompleto}</span>
            </Label>
            <Input
              id="confirmar-retirada"
              value={confirmacion}
              autoComplete="off"
              placeholder="Nombre completo de la persona"
              onChange={(e) => setConfirmacion(e.target.value)}
              disabled={isPending}
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void retirar();
              }}
              disabled={isPending || !coincide}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Retirando...
                </>
              ) : (
                "Retirar ficha"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
