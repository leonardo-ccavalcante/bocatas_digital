import type { UseFormRegister, UseFormWatch, UseFormSetValue, FieldErrors } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type PersonCreate, CANAL_LLEGADA_LABELS } from "../../../schemas";
import { SelectField, FieldError } from "../_shared";

interface Step0CanalProps {
  register: UseFormRegister<PersonCreate>;
  watch: UseFormWatch<PersonCreate>;
  setValue: UseFormSetValue<PersonCreate>;
  errors: FieldErrors<PersonCreate>;
}

export function Step0Canal({ register, watch, setValue, errors }: Step0CanalProps) {
  return (
    <div className="space-y-4">
      <SelectField
        label="Canal de llegada"
        id="canal_llegada"
        value={watch("canal_llegada") ?? ""}
        onChange={(v) => setValue("canal_llegada", v as PersonCreate["canal_llegada"])}
        options={CANAL_LLEGADA_LABELS}
        required
      />
      <FieldError message={errors.canal_llegada?.message} />
      <div className="space-y-1">
        <Label htmlFor="entidad_derivadora">Entidad derivadora (opcional)</Label>
        <Input id="entidad_derivadora" {...register("entidad_derivadora")} placeholder="Cruz Roja, Servicios Sociales..." />
      </div>
      <div className="space-y-1">
        <Label htmlFor="persona_referencia">Persona de referencia (opcional)</Label>
        <Input id="persona_referencia" {...register("persona_referencia")} placeholder="Nombre del referente" />
      </div>
    </div>
  );
}
