/** Cómo llegó la persona. Ningún paso del alta lo dejaba corregir después. */
import { CANAL_LLEGADA_LABELS, type PersonCreate } from "../../../schemas";
import { SelectField } from "../../RegistrationWizard/_shared";
import { Seccion, Texto, type SeccionProps } from "./_controls";

export function SeccionCanal({ values, onChange }: SeccionProps) {
  return (
    <Seccion titulo="Canal de llegada" id="edit-seccion-canal">
      <SelectField
        label="Canal de llegada"
        id="edit-canal_llegada"
        value={values.canal_llegada ?? ""}
        onChange={(v) => onChange("canal_llegada", v as PersonCreate["canal_llegada"])}
        options={CANAL_LLEGADA_LABELS}
      />
      <div className="grid grid-cols-2 gap-3">
        <Texto
          id="edit-entidad_derivadora"
          label="Entidad derivadora"
          maxLength={200}
          value={values.entidad_derivadora}
          onChange={(v) => onChange("entidad_derivadora", v)}
        />
        <Texto
          id="edit-persona_referencia"
          label="Persona de referencia"
          maxLength={200}
          value={values.persona_referencia}
          onChange={(v) => onChange("persona_referencia", v)}
        />
      </div>
    </Seccion>
  );
}
