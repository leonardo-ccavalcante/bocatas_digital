/** Documento. `situacion_legal` es de alto riesgo: sólo admin/superadmin. */
import {
  PAIS_DOCUMENTO_LABELS,
  TIPO_DOCUMENTO_LABELS,
  SITUACION_LEGAL_LABELS,
  type PersonCreate,
} from "../../../schemas";
import { SelectField } from "../../RegistrationWizard/_shared";
import { SearchableSelect } from "../../SearchableSelect";
import { DateField } from "../../DateField";
import { Seccion, Texto, type SeccionProps } from "./_controls";

export function SeccionDocumento({ values, onChange, isAdmin }: SeccionProps) {
  return (
    <Seccion titulo="Documento" id="edit-seccion-documento">
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Tipo de documento"
          id="edit-tipo_documento"
          value={values.tipo_documento ?? ""}
          onChange={(v) => onChange("tipo_documento", v as PersonCreate["tipo_documento"])}
          options={TIPO_DOCUMENTO_LABELS}
        />
        <Texto
          id="edit-numero_documento"
          label="Número de documento"
          value={values.numero_documento}
          onChange={(v) => onChange("numero_documento", v)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {values.tipo_documento === "Documento_Extranjero" && (
          <SearchableSelect
            label="País del documento"
            id="edit-pais_documento"
            value={values.pais_documento ?? ""}
            onChange={(v) => onChange("pais_documento", v || null)}
            options={PAIS_DOCUMENTO_LABELS}
            placeholder="Seleccionar país..."
            searchPlaceholder="Escribe el país..."
          />
        )}
        <DateField
          label="Llegada a España"
          id="edit-fecha_llegada_espana"
          value={values.fecha_llegada_espana}
          onChange={(iso) => onChange("fecha_llegada_espana", iso)}
        />
      </div>
      {isAdmin && (
        <SelectField
          label="Situación legal"
          id="edit-situacion_legal"
          value={values.situacion_legal ?? ""}
          onChange={(v) => onChange("situacion_legal", v as PersonCreate["situacion_legal"])}
          options={SITUACION_LEGAL_LABELS}
        />
      )}
    </Seccion>
  );
}
