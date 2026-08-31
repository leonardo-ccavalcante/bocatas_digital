/**
 * EditPersonModal — corregir una ficha ya creada (#177).
 *
 * Sólo se envía lo que ha CAMBIADO: el servidor trata el parche como parcial y
 * lo ausente no se toca. Mandar la ficha entera convertiría cada corrección de
 * un apellido en una reescritura de treinta columnas.
 *
 * Las listas de campos y el motor del diff viven en edit/editableFields.ts;
 * aquí queda la orquestación: diff → puerta Art. 9 → validación → mutación →
 * invalidación de caché.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import type { Database } from "@/lib/database.types";
import {
  describirErrores,
  mensajeDeErrores,
} from "../RegistrationWizard/_formErrors";
import { EditPersonForm } from "./EditPersonForm";
import {
  EditableSchema,
  calcularCambios,
  tocaArt9,
  valoresIniciales,
  type EditableValues,
} from "./edit/editableFields";

type PersonRow = Database["public"]["Tables"]["persons"]["Row"];

/** Ancla de la sección a la que saltar al abrir (los lápices del Resumen). */
export type SeccionEditable =
  | "identidad"
  | "documento"
  | "contacto"
  | "vivienda"
  | "situacion"
  | "social"
  | "canal"
  | "colectivo";

interface EditPersonModalProps {
  person: PersonRow;
  isAdmin: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  /** Sección a la que desplazarse al abrir. Sin esto, arriba del todo. */
  seccionInicial?: SeccionEditable;
}

export function EditPersonModal({
  person,
  isAdmin,
  open,
  onOpenChange,
  onSaved,
  seccionInicial,
}: EditPersonModalProps) {
  const iniciales = useMemo(
    () => valoresIniciales(person as unknown as Record<string, unknown>),
    [person]
  );
  const [values, setValues] = useState<EditableValues>(iniciales);

  // Art. 9: candado cerrado y declaración sin marcar en cada apertura. No hay
  // nada persistido que leer — el flag es transitorio y `consents` cubre otros
  // fines — así que el cliente no puede saltarse la pregunta honestamente.
  const [art9Desbloqueado, setArt9Desbloqueado] = useState(false);
  const [consentimientoArt9, setConsentimientoArt9] = useState(false);

  const contenidoRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || !seccionInicial) return;
    const destino = contenidoRef.current?.querySelector(`#edit-seccion-${seccionInicial}`);
    destino?.scrollIntoView({ block: "start" });
  }, [open, seccionInicial]);

  const utils = trpc.useUtils();
  const { mutateAsync: update, isPending } = trpc.persons.update.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.persons.getById.invalidate({ id: person.id }),
        // Sin filtro de input a propósito: el directorio se pide con un límite
        // y PersonsTable con otro, así que filtrar dejaría uno sin refrescar.
        utils.persons.getAll.invalidate(),
        // Tampoco: la clave lleva el texto buscado, y hay una entrada por cada
        // cadena tecleada. Y no es cosmético — persons.search devuelve
        // `restricciones_alimentarias`, que es el aviso de alergia que lee el
        // comedor: una alergia corregida y servida obsoleta es un fallo de
        // seguridad alimentaria, no un refresco tardío.
        utils.persons.search.invalidate(),
      ]);
    },
  });

  const onChange = <K extends keyof EditableValues>(campo: K, valor: EditableValues[K]) => {
    setValues((prev) => ({ ...prev, [campo]: valor }));
  };

  const guardar = async () => {
    const cambios = calcularCambios(iniciales, values, { incluirArt9: art9Desbloqueado });
    if (Object.keys(cambios).length === 0) {
      toast.info("No has cambiado nada.");
      return;
    }

    // Espejo de la puerta del servidor (update.ts), no su sustituto: fallar
    // aquí evita un viaje y un mensaje genérico.
    const art9 = tocaArt9(cambios);
    if (art9 && !consentimientoArt9) {
      toast.error(
        "Marca el consentimiento explícito de la persona para guardar los datos de colectivo."
      );
      return;
    }

    // Se valida SÓLO lo tocado: un parche parcial no debe fallar por un campo
    // que la ficha ya tenía vacío desde el alta.
    const parsed = EditableSchema.safeParse(cambios);
    if (!parsed.success) {
      toast.error(mensajeDeErrores(describirErrores(parsed.error.issues)));
      return;
    }

    // El flag es transitorio y sólo viaja cuando el parche lleva Art. 9 de
    // verdad: mandarlo siempre afirmaría un consentimiento que nadie ha pedido.
    const data = art9 ? { ...parsed.data, colectivo_consentimiento: true } : parsed.data;

    try {
      await update({ id: person.id, data });
      toast.success("Ficha actualizada.");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Error desconocido";
      // PRECONDITION_FAILED = falta PII_ENCRYPTION_KEY en el servidor. El
      // prefijo genérico lo enterraba y parecía un fallo de la ficha.
      if (/PII_ENCRYPTION_KEY|cifrado/i.test(mensaje)) {
        toast.error(
          "No se pueden guardar los datos de colectivo: falta la clave de cifrado " +
            "(PII_ENCRYPTION_KEY) en el servidor. El resto de la ficha sí se puede guardar."
        );
        return;
      }
      toast.error(`No se pudo guardar: ${mensaje}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent ref={contenidoRef} className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar ficha</DialogTitle>
          <DialogDescription>
            Se guarda sólo lo que cambies. Los datos de colectivo están bajo
            candado: abrirlo exige declarar el consentimiento de la persona.
          </DialogDescription>
        </DialogHeader>

        <EditPersonForm
          values={values}
          onChange={onChange}
          isAdmin={isAdmin}
          art9Desbloqueado={art9Desbloqueado}
          onArt9Desbloquear={setArt9Desbloqueado}
          consentimientoArt9={consentimientoArt9}
          onConsentimientoArt9={setConsentimientoArt9}
        />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button onClick={() => void guardar()} disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Guardando...
              </>
            ) : (
              <>
                <Save className="mr-1 h-4 w-4" /> Guardar cambios
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
