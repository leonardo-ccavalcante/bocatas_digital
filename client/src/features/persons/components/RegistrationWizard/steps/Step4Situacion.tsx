import type { UseFormWatch, UseFormSetValue } from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type PersonCreate,
  TIPO_VIVIENDA_LABELS,
  NIVEL_ESTUDIOS_LABELS,
  SITUACION_LABORAL_LABELS,
  SITUACION_ANTE_EMPLEO_LABELS,
  NIVEL_INGRESOS_LABELS,
  COLECTIVO_LABELS,
} from "../../../schemas";
import { SelectField } from "../_shared";

interface Step4SituacionProps {
  watch: UseFormWatch<PersonCreate>;
  setValue: UseFormSetValue<PersonCreate>;
}

export function Step4Situacion({ watch, setValue }: Step4SituacionProps) {
  const selectedColectivos = (watch("colectivos") ?? []) as string[];

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
      {/* Two orthogonal labour dimensions (MECE): employment TYPE and the
          FSE/IRPF "situación ante el empleo" status that feeds the funder report. */}
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Situación laboral"
          id="situacion_laboral"
          value={watch("situacion_laboral") ?? ""}
          onChange={(v) => setValue("situacion_laboral", v as PersonCreate["situacion_laboral"])}
          options={SITUACION_LABORAL_LABELS}
        />
        <SelectField
          label="Situación ante el empleo (IRPF)"
          id="situacion_ante_empleo"
          value={watch("situacion_ante_empleo") ?? ""}
          onChange={(v) => setValue("situacion_ante_empleo", v as PersonCreate["situacion_ante_empleo"])}
          options={SITUACION_ANTE_EMPLEO_LABELS}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Ingresos aproximados"
          id="nivel_ingresos"
          value={watch("nivel_ingresos") ?? ""}
          onChange={(v) => setValue("nivel_ingresos", v as PersonCreate["nivel_ingresos"])}
          options={NIVEL_INGRESOS_LABELS}
        />
        <div className="flex items-end gap-2 pb-1">
          <Checkbox
            id="empadronado"
            checked={watch("empadronado") ?? false}
            onCheckedChange={(v) => setValue("empadronado", v === true)}
          />
          <Label htmlFor="empadronado" className="cursor-pointer">Empadronado/a en Madrid</Label>
        </div>
      </div>

      {/* Colectivo — RGPD Art. 9/10 special-category (etnia / orientación /
          situación penal). Optional; persisted ONLY if the person grants the
          explicit consent in the Consentimiento step. */}
      <fieldset className="space-y-2 rounded-lg border border-border p-3">
        <legend className="px-1 text-sm font-medium">Pertenencia a colectivo (opcional)</legend>
        <p className="text-xs text-muted-foreground">
          Dato sensible. Solo se guarda si la persona da su consentimiento explícito
          en el paso de Consentimiento.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(COLECTIVO_LABELS).map(([k, label]) => (
            <div key={k} className="flex items-center gap-2">
              <Checkbox
                id={`colectivo-${k}`}
                checked={selectedColectivos.includes(k)}
                onCheckedChange={(v) => {
                  const cur = (watch("colectivos") ?? []) as string[];
                  const next = v === true ? [...cur, k] : cur.filter((x) => x !== k);
                  setValue("colectivos", next as PersonCreate["colectivos"]);
                }}
              />
              <Label htmlFor={`colectivo-${k}`} className="cursor-pointer">{label}</Label>
            </div>
          ))}
        </div>
        <div className="space-y-1">
          <Label htmlFor="colectivo_otros">Otros (especificar)</Label>
          <Input
            id="colectivo_otros"
            value={watch("colectivo_otros") ?? ""}
            onChange={(e) => setValue("colectivo_otros", e.target.value)}
            placeholder="Otro colectivo..."
            maxLength={200}
          />
        </div>
        {/* Explicit Art. 9(2)(a) consent at the point of collection. This flag
            gates server-side persistence of the colectivo* fields (crud.ts).
            Without it, nothing is stored — recusar ≠ negar servicio. */}
        <div className="flex items-start gap-2 pt-1">
          <Checkbox
            id="colectivo_consentimiento"
            className="mt-0.5"
            checked={watch("colectivo_consentimiento") ?? false}
            onCheckedChange={(v) => setValue("colectivo_consentimiento", v === true)}
          />
          <Label htmlFor="colectivo_consentimiento" className="cursor-pointer text-xs font-normal">
            La persona consiente explícitamente el tratamiento de estos datos de
            categoría especial (RGPD Art. 9). Sin este consentimiento no se guardan.
          </Label>
        </div>
      </fieldset>
    </div>
  );
}
