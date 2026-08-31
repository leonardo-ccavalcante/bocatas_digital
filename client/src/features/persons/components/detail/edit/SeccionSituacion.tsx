/** Estudios, empleo e ingresos. MECE de dos campos: situación laboral (qué hace)
 *  y situación ante el empleo (cómo cuenta para el informe IRPF). */
import {
  NIVEL_ESTUDIOS_LABELS,
  SITUACION_LABORAL_LABELS,
  SITUACION_ANTE_EMPLEO_LABELS,
  NIVEL_INGRESOS_LABELS,
  type PersonCreate,
} from "../../../schemas";
import { SelectField } from "../../RegistrationWizard/_shared";
import { Seccion, type SeccionProps } from "./_controls";

export function SeccionSituacion({ values, onChange }: SeccionProps) {
  return (
    <Seccion titulo="Situación" id="edit-seccion-situacion">
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Nivel de estudios"
          id="edit-nivel_estudios"
          value={values.nivel_estudios ?? ""}
          onChange={(v) => onChange("nivel_estudios", v as PersonCreate["nivel_estudios"])}
          options={NIVEL_ESTUDIOS_LABELS}
        />
        <SelectField
          label="Situación laboral"
          id="edit-situacion_laboral"
          value={values.situacion_laboral ?? ""}
          onChange={(v) => onChange("situacion_laboral", v as PersonCreate["situacion_laboral"])}
          options={SITUACION_LABORAL_LABELS}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Situación ante el empleo (IRPF)"
          id="edit-situacion_ante_empleo"
          value={values.situacion_ante_empleo ?? ""}
          onChange={(v) =>
            onChange("situacion_ante_empleo", v as PersonCreate["situacion_ante_empleo"])
          }
          options={SITUACION_ANTE_EMPLEO_LABELS}
        />
        <SelectField
          label="Ingresos aproximados"
          id="edit-nivel_ingresos"
          value={values.nivel_ingresos ?? ""}
          onChange={(v) => onChange("nivel_ingresos", v as PersonCreate["nivel_ingresos"])}
          options={NIVEL_INGRESOS_LABELS}
        />
      </div>
    </Seccion>
  );
}
