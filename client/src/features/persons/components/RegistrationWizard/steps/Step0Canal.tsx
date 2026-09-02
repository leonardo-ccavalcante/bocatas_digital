import { useState } from "react";
import type { UseFormRegister, UseFormWatch, UseFormSetValue, FieldErrors } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { InstitucionTypeahead } from "@/features/derivar/InstitucionTypeahead";
import type { InstitucionPickedItem } from "@/features/derivar/CrearInstitucionInlineModal";
import { type PersonCreate, CANAL_LLEGADA_LABELS } from "../../../schemas";
import { SelectField, FieldError } from "../_shared";

interface Step0CanalProps {
  register: UseFormRegister<PersonCreate>;
  watch: UseFormWatch<PersonCreate>;
  setValue: UseFormSetValue<PersonCreate>;
  errors: FieldErrors<PersonCreate>;
}

export function Step0Canal({ register, watch, setValue, errors }: Step0CanalProps) {
  // Selección viva del catálogo; el formulario sólo guarda el NOMBRE en el
  // TEXT entidad_derivadora — cero migración, fichas antiguas intactas. El
  // texto libre no elegido también se conserva (onTextChange), y crear una
  // institución inline sigue reservado a admin (instituciones.create).
  const [institucion, setInstitucion] = useState<InstitucionPickedItem | null>(null);
  return (
    <div className="space-y-4">
      <SelectField
        label="Canal de llegada"
        id="canal_llegada"
        value={watch("canal_llegada") ?? ""}
        onChange={(v) => setValue("canal_llegada", v as PersonCreate["canal_llegada"])}
        options={CANAL_LLEGADA_LABELS}
        required
        aria-describedby={errors.canal_llegada ? "canal_llegada-error" : undefined}
        aria-invalid={!!errors.canal_llegada}
      />
      <FieldError id="canal_llegada-error" message={errors.canal_llegada?.message} />
      {watch("canal_llegada") === "retorno_bocatas" && (
        <div className="space-y-1">
          <Label htmlFor="motivo_retorno">Motivo del retorno (opcional)</Label>
          <Textarea
            id="motivo_retorno"
            rows={3}
            maxLength={500}
            placeholder="Qué le trae de vuelta a Bocatas..."
            {...register("motivo_retorno")}
          />
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor="entidad_derivadora">Entidad derivadora (opcional)</Label>
        <InstitucionTypeahead
          id="entidad_derivadora"
          value={institucion}
          text={watch("entidad_derivadora") ?? ""}
          onChange={setInstitucion}
          onTextChange={(t) => setValue("entidad_derivadora", t === "" ? null : t)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="persona_referencia">Persona de referencia (opcional)</Label>
        <Input id="persona_referencia" {...register("persona_referencia")} placeholder="Nombre del referente" />
      </div>
    </div>
  );
}
