/** Identidad. `idiomas` (array) no lo pinta ningún paso del alta. */
import {
  GENERO_LABELS,
  IDIOMA_LABELS,
  PAIS_LABELS,
  type PersonCreate,
} from "../../../schemas";
import { SelectField } from "../../RegistrationWizard/_shared";
import { SearchableSelect } from "../../SearchableSelect";
import { DateField } from "../../DateField";
import { Seccion, Texto, GrupoCasillas, type SeccionProps } from "./_controls";

export function SeccionIdentidad({ values, onChange }: SeccionProps) {
  return (
    <Seccion titulo="Identidad" id="edit-seccion-identidad">
      <div className="grid grid-cols-2 gap-3">
        <Texto id="edit-nombre" label="Nombre" value={values.nombre} onChange={(v) => onChange("nombre", v)} />
        <Texto id="edit-apellidos" label="Apellidos" value={values.apellidos} onChange={(v) => onChange("apellidos", v)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <DateField
          label="Fecha de nacimiento"
          id="edit-fecha_nacimiento"
          value={values.fecha_nacimiento}
          onChange={(iso) => onChange("fecha_nacimiento", iso)}
        />
        <SelectField
          label="Género"
          id="edit-genero"
          value={values.genero ?? ""}
          onChange={(v) => onChange("genero", v as PersonCreate["genero"])}
          options={GENERO_LABELS}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SearchableSelect
          label="País de origen"
          id="edit-pais_origen"
          value={values.pais_origen ?? ""}
          onChange={(v) => onChange("pais_origen", v || null)}
          options={PAIS_LABELS}
          placeholder="Seleccionar país..."
          searchPlaceholder="Escribe el país..."
        />
        <SelectField
          label="Idioma principal"
          id="edit-idioma"
          value={values.idioma_principal ?? "es"}
          onChange={(v) => onChange("idioma_principal", v as PersonCreate["idioma_principal"])}
          options={IDIOMA_LABELS}
        />
      </div>
      <GrupoCasillas
        idPrefijo="edit-idiomas"
        label="Otros idiomas que habla"
        opciones={IDIOMA_LABELS}
        columnas={3}
        valor={values.idiomas}
        onChange={(siguiente) => onChange("idiomas", siguiente as PersonCreate["idiomas"])}
      />
    </Seccion>
  );
}
