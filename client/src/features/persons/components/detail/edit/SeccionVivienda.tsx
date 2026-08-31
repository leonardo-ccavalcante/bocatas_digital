/** Vivienda. `estabilidad_habitacional` no lo pintaba ningún paso del alta. */
import {
  ESTABILIDAD_HABITACIONAL_LABELS,
  TIPO_VIVIENDA_LABELS,
  type PersonCreate,
} from "../../../schemas";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { SelectField } from "../../RegistrationWizard/_shared";
import { Seccion, type SeccionProps } from "./_controls";

/** TIPO_VIVIENDA_LABELS lleva icono + etiqueta; SelectField quiere texto plano. */
const VIVIENDA_OPCIONES = Object.fromEntries(
  Object.entries(TIPO_VIVIENDA_LABELS).map(([k, v]) => [
    k,
    typeof v === "object" && "label" in v
      ? `${(v as { icon: string; label: string }).icon} ${(v as { icon: string; label: string }).label}`
      : String(v),
  ])
);

export function SeccionVivienda({ values, onChange }: SeccionProps) {
  return (
    <Seccion titulo="Vivienda" id="edit-seccion-vivienda">
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Tipo de vivienda"
          id="edit-tipo_vivienda"
          value={values.tipo_vivienda ?? ""}
          onChange={(v) => onChange("tipo_vivienda", v as PersonCreate["tipo_vivienda"])}
          options={VIVIENDA_OPCIONES}
        />
        <SelectField
          label="Estabilidad habitacional"
          id="edit-estabilidad_habitacional"
          value={values.estabilidad_habitacional ?? ""}
          onChange={(v) =>
            onChange("estabilidad_habitacional", v as PersonCreate["estabilidad_habitacional"])
          }
          options={ESTABILIDAD_HABITACIONAL_LABELS}
        />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="edit-empadronado"
          checked={values.empadronado ?? false}
          onCheckedChange={(v) => onChange("empadronado", v === true)}
        />
        <Label htmlFor="edit-empadronado" className="cursor-pointer">
          Empadronado/a en Madrid
        </Label>
      </div>
    </Seccion>
  );
}
