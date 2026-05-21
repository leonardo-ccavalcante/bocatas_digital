import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { type z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { InstitucionCreateSchema, type InstitucionCreate } from "../../../../../shared/derivar/types";
import type { InstitucionRow } from "./_InstitucionTypes";

type Mode = "create" | "edit";

/**
 * Form values use the Zod _input_ shape so `areas` is `string[] | undefined`
 * (what the uncontrolled inputs produce before Zod applies the default).
 * After `handleSubmit` the resolver coerces to the output type (InstitucionCreate).
 */
type FormValues = z.input<typeof InstitucionCreateSchema>;

type Props = {
  open: boolean;
  mode: Mode;
  /**
   * NOTE: parent must use `key={initial?.id ?? "new"}` so this component
   * remounts on each open, ensuring `defaultValues` are always fresh.
   */
  initial: InstitucionRow | null;
  isPending: boolean;
  onClose: () => void;
  onSave: (values: InstitucionCreate, id?: string) => void;
};

const TIPO_OPTIONS = [
  { value: "publica", label: "Pública" },
  { value: "ong", label: "ONG" },
  { value: "parroquia", label: "Parroquia" },
  { value: "privada", label: "Privada" },
  { value: "otro", label: "Otro" },
] as const;

export function InstitucionEditDialog({ open, mode, initial, isPending, onClose, onSave }: Props) {
  /**
   * defaultValues are computed once at mount (parent remounts via `key`).
   * No useEffect reset needed — avoids timing issues between effect and user
   * interaction in jsdom tests.
   */
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(InstitucionCreateSchema),
    defaultValues: {
      nombre: initial?.nombre ?? "",
      tipo: (initial?.tipo as FormValues["tipo"]) ?? undefined,
      areas: initial?.areas ?? [],
      direccion: initial?.direccion ?? undefined,
      codigo_postal: initial?.codigo_postal ?? undefined,
      telefono: initial?.telefono ?? undefined,
      email: initial?.email ?? undefined,
      notas: initial?.notas ?? undefined,
    },
  });

  const tipo = watch("tipo");
  const areasRaw = watch("areas") ?? [];

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) onClose();
  }

  function onSubmit(values: FormValues) {
    onSave(values as InstitucionCreate, initial?.id);
  }

  const title = mode === "create" ? "Nueva institución" : "Editar institución";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Rellena los campos para crear una nueva institución en el catálogo."
              : "Modifica los campos editables. El campo Distrito se calcula automáticamente del código postal."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => { e.preventDefault(); }}
          className="space-y-4 py-2"
          noValidate
        >
          <div>
            <Label htmlFor="inst-nombre">Nombre *</Label>
            <Input
              id="inst-nombre"
              placeholder="Ej. Cáritas Madrid"
              {...register("nombre")}
              aria-describedby={errors.nombre ? "inst-nombre-error" : undefined}
            />
            {errors.nombre && (
              <p id="inst-nombre-error" className="text-xs text-destructive mt-1">
                {errors.nombre.message}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="inst-tipo">Tipo</Label>
            <Select
              value={tipo ?? ""}
              onValueChange={(v) =>
                setValue("tipo", v as InstitucionCreate["tipo"], { shouldValidate: true })
              }
            >
              <SelectTrigger id="inst-tipo" aria-label="Tipo de institución">
                <SelectValue placeholder="Seleccionar tipo..." />
              </SelectTrigger>
              <SelectContent>
                {TIPO_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="inst-telefono">Teléfono</Label>
              <Input
                id="inst-telefono"
                placeholder="Ej. 91 123 45 67"
                {...register("telefono", { setValueAs: (v: string) => v === "" ? undefined : v })}
              />
            </div>
            <div>
              <Label htmlFor="inst-email">Email</Label>
              <Input
                id="inst-email"
                type="email"
                placeholder="contacto@org.es"
                {...register("email", { setValueAs: (v: string) => v === "" ? undefined : v })}
                aria-describedby={errors.email ? "inst-email-error" : undefined}
              />
              {errors.email && (
                <p id="inst-email-error" className="text-xs text-destructive mt-1">
                  {errors.email.message}
                </p>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="inst-direccion">Dirección</Label>
            <Input
              id="inst-direccion"
              placeholder="Calle, número..."
              {...register("direccion", { setValueAs: (v: string) => v === "" ? undefined : v })}
            />
          </div>

          <div>
            <Label htmlFor="inst-cp">Código postal</Label>
            <Input
              id="inst-cp"
              placeholder="28001"
              maxLength={5}
              {...register("codigo_postal", { setValueAs: (v: string) => v === "" ? undefined : v })}
              aria-describedby={errors.codigo_postal ? "inst-cp-error" : undefined}
            />
            {errors.codigo_postal && (
              <p id="inst-cp-error" className="text-xs text-destructive mt-1">
                {errors.codigo_postal.message}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              El distrito se asigna automáticamente al guardar.
            </p>
          </div>

          <div>
            <Label htmlFor="inst-areas">Áreas (separadas por coma)</Label>
            <Input
              id="inst-areas"
              placeholder="salud, vivienda, empleo"
              value={areasRaw.join(", ")}
              onChange={(e) => {
                const parts = e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
                setValue("areas", parts, { shouldValidate: true });
              }}
            />
          </div>

          <div>
            <Label htmlFor="inst-notas">Notas</Label>
            <Input
              id="inst-notas"
              placeholder="Observaciones internas..."
              {...register("notas", { setValueAs: (v: string) => v === "" ? undefined : v })}
              aria-describedby={errors.notas ? "inst-notas-error" : undefined}
            />
            {errors.notas && (
              <p id="inst-notas-error" className="text-xs text-destructive mt-1">
                {errors.notas.message}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={isPending}
              aria-label="Guardar institución"
              onClick={() => void handleSubmit(onSubmit)()}
            >
              {isPending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
