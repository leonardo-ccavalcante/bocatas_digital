/**
 * EditPersonModal — corregir una ficha ya creada (#177).
 *
 * Sólo se envía lo que ha CAMBIADO: el servidor trata el parche como parcial y
 * lo ausente no se toca. Mandar la ficha entera convertiría cada corrección de
 * un apellido en una reescritura de treinta columnas.
 */
import { useMemo, useState } from "react";
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
import { PersonCreateSchema } from "../../schemas";
import {
  describirErrores,
  mensajeDeErrores,
} from "../RegistrationWizard/_formErrors";
import { EditPersonForm, type EditableValues } from "./EditPersonForm";

type PersonRow = Database["public"]["Tables"]["persons"]["Row"];

/** Los mismos campos que el servidor acepta parchear. */
const EditableSchema = PersonCreateSchema.omit({
  program_ids: true,
  fase_itinerario: true,
}).partial();

const CAMPOS_EDITABLES = [
  "nombre", "apellidos", "fecha_nacimiento", "genero", "pais_origen", "idioma_principal",
  "tipo_documento", "numero_documento", "pais_documento", "situacion_legal",
  "fecha_llegada_espana", "telefono", "email", "direccion", "codigo_postal",
  "municipio", "barrio_zona", "tipo_vivienda", "nivel_estudios",
  "situacion_laboral", "situacion_ante_empleo", "nivel_ingresos", "empadronado",
] as const;

type CampoEditable = (typeof CAMPOS_EDITABLES)[number];

function valoresIniciales(person: PersonRow): EditableValues {
  const iniciales: Record<string, unknown> = {};
  for (const campo of CAMPOS_EDITABLES) {
    iniciales[campo] = (person as unknown as Record<string, unknown>)[campo] ?? undefined;
  }
  return iniciales as EditableValues;
}

/**
 * Diferencia contra los valores de partida. `""` y `null` se consideran lo
 * mismo (campo vacío) para que abrir y cerrar el formulario sin tocar nada no
 * genere un parche.
 */
export function calcularCambios(
  iniciales: EditableValues,
  actuales: EditableValues
): EditableValues {
  const vacio = (v: unknown) => v === "" || v === null || v === undefined;
  const cambios: Record<string, unknown> = {};
  for (const campo of CAMPOS_EDITABLES) {
    const antes = iniciales[campo as CampoEditable];
    const ahora = actuales[campo as CampoEditable];
    if (vacio(antes) && vacio(ahora)) continue;
    if (antes === ahora) continue;
    cambios[campo] = ahora === undefined ? null : ahora;
  }
  return cambios as EditableValues;
}

interface EditPersonModalProps {
  person: PersonRow;
  isAdmin: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function EditPersonModal({
  person,
  isAdmin,
  open,
  onOpenChange,
  onSaved,
}: EditPersonModalProps) {
  const iniciales = useMemo(() => valoresIniciales(person), [person]);
  const [values, setValues] = useState<EditableValues>(iniciales);
  const { mutateAsync: update, isPending } = trpc.persons.update.useMutation();

  const onChange = <K extends keyof EditableValues>(campo: K, valor: EditableValues[K]) => {
    setValues((prev) => ({ ...prev, [campo]: valor }));
  };

  const guardar = async () => {
    const cambios = calcularCambios(iniciales, values);
    if (Object.keys(cambios).length === 0) {
      toast.info("No has cambiado nada.");
      return;
    }

    // Se valida SÓLO lo tocado: un parche parcial no debe fallar por un campo
    // que la ficha ya tenía vacío desde el alta.
    const parsed = EditableSchema.safeParse(cambios);
    if (!parsed.success) {
      toast.error(mensajeDeErrores(describirErrores(parsed.error.issues)));
      return;
    }

    try {
      await update({ id: person.id, data: parsed.data });
      toast.success("Ficha actualizada.");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Error desconocido";
      toast.error(`No se pudo guardar: ${mensaje}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar ficha</DialogTitle>
          <DialogDescription>
            Se guarda sólo lo que cambies. Los datos de colectivo no se editan
            aquí: requieren declarar el consentimiento de la persona.
          </DialogDescription>
        </DialogHeader>

        <EditPersonForm values={values} onChange={onChange} isAdmin={isAdmin} />

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
