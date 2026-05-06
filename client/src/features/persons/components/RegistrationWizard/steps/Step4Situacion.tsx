import type { UseFormWatch, UseFormSetValue } from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  type PersonCreate,
  TIPO_VIVIENDA_LABELS,
  NIVEL_ESTUDIOS_LABELS,
  SITUACION_LABORAL_LABELS,
  NIVEL_INGRESOS_LABELS,
} from "../../../schemas";
import { SelectField } from "../_shared";

interface Step4SituacionProps {
  watch: UseFormWatch<PersonCreate>;
  setValue: UseFormSetValue<PersonCreate>;
}

export function Step4Situacion({ watch, setValue }: Step4SituacionProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Tipo de vivienda"
          id="tipo_vivienda"
          value={watch("tipo_vivienda") ?? ""}
          onChange={(v) => setValue("tipo_vivienda", v as PersonCreate["tipo_vivienda"])}
          options={Object.fromEntries(
            Object.entries(TIPO_VIVIENDA_LABELS).map(([k, v]) => [
              k,
              typeof v === "object" && "label" in v ? `${(v as {icon:string;label:string}).icon} ${(v as {icon:string;label:string}).label}` : String(v),
            ])
          )}
        />
        <SelectField
          label="Nivel de estudios"
          id="nivel_estudios"
          value={watch("nivel_estudios") ?? ""}
          onChange={(v) => setValue("nivel_estudios", v as PersonCreate["nivel_estudios"])}
          options={NIVEL_ESTUDIOS_LABELS}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Situación laboral"
          id="situacion_laboral"
          value={watch("situacion_laboral") ?? ""}
          onChange={(v) => setValue("situacion_laboral", v as PersonCreate["situacion_laboral"])}
          options={SITUACION_LABORAL_LABELS}
        />
        <SelectField
          label="Ingresos aproximados"
          id="nivel_ingresos"
          value={watch("nivel_ingresos") ?? ""}
          onChange={(v) => setValue("nivel_ingresos", v as PersonCreate["nivel_ingresos"])}
          options={NIVEL_INGRESOS_LABELS}
        />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="empadronado"
          checked={watch("empadronado") ?? false}
          onCheckedChange={(v) => setValue("empadronado", v === true)}
        />
        <Label htmlFor="empadronado" className="cursor-pointer">Empadronado/a en Madrid</Label>
      </div>
    </div>
  );
}
