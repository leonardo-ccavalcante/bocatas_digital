/**
 * EditPersonForm — los campos de la ficha, editables.
 *
 * Mismas etiquetas y mismos controles que el alta (DateField, SearchableSelect)
 * para que corregir un dato se parezca a haberlo introducido.
 *
 * NO incluye los datos de colectivo (RGPD Art. 9/10) a propósito: tocarlos
 * exige declarar el consentimiento explícito de la persona, y eso es una
 * conversación con ella, no una casilla más en un formulario de corrección.
 * El servidor rechaza el parche si llegan sin consentimiento declarado
 * (server/routers/persons/update.ts).
 */
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  type PersonCreate,
  GENERO_LABELS,
  IDIOMA_LABELS,
  PAIS_LABELS,
  PAIS_DOCUMENTO_LABELS,
  TIPO_DOCUMENTO_LABELS,
  SITUACION_LEGAL_LABELS,
  TIPO_VIVIENDA_LABELS,
  NIVEL_ESTUDIOS_LABELS,
  SITUACION_LABORAL_LABELS,
  SITUACION_ANTE_EMPLEO_LABELS,
  NIVEL_INGRESOS_LABELS,
} from "../../schemas";
import { SelectField } from "../RegistrationWizard/_shared";
import { SearchableSelect } from "../SearchableSelect";
import { DateField } from "../DateField";

export type EditableValues = Partial<PersonCreate>;

interface EditPersonFormProps {
  values: EditableValues;
  onChange: <K extends keyof EditableValues>(campo: K, valor: EditableValues[K]) => void;
  /** `situacion_legal` es campo de alto riesgo: sólo admin/superadmin. */
  isAdmin: boolean;
}

const VIVIENDA_OPCIONES = Object.fromEntries(
  Object.entries(TIPO_VIVIENDA_LABELS).map(([k, v]) => [
    k,
    typeof v === "object" && "label" in v
      ? `${(v as { icon: string; label: string }).icon} ${(v as { icon: string; label: string }).label}`
      : String(v),
  ])
);

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-eyebrow text-muted-foreground">{titulo}</h3>
      {children}
    </section>
  );
}

function Texto({
  id,
  label,
  value,
  onChange,
  ...rest
}: {
  id: string;
  label: string;
  value: string | null | undefined;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  inputMode?: "text" | "numeric" | "tel" | "email";
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...rest} />
    </div>
  );
}

export function EditPersonForm({ values, onChange, isAdmin }: EditPersonFormProps) {
  return (
    <div className="space-y-6">
      <Seccion titulo="Identidad">
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
      </Seccion>

      <Seccion titulo="Documento">
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

      <Seccion titulo="Contacto">
        <div className="grid grid-cols-2 gap-3">
          <Texto id="edit-telefono" label="Teléfono" value={values.telefono} inputMode="tel" onChange={(v) => onChange("telefono", v)} />
          <Texto id="edit-email" label="Email" value={values.email} inputMode="email" onChange={(v) => onChange("email", v)} />
        </div>
        <Texto id="edit-direccion" label="Dirección" value={values.direccion} onChange={(v) => onChange("direccion", v)} />
        <div className="grid grid-cols-3 gap-3">
          <Texto id="edit-codigo_postal" label="Código postal" value={values.codigo_postal} inputMode="numeric" onChange={(v) => onChange("codigo_postal", v)} />
          <Texto id="edit-municipio" label="Municipio" value={values.municipio} onChange={(v) => onChange("municipio", v)} />
          <Texto id="edit-barrio_zona" label="Barrio o zona" value={values.barrio_zona} onChange={(v) => onChange("barrio_zona", v)} />
        </div>
      </Seccion>

      <Seccion titulo="Situación">
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="Tipo de vivienda"
            id="edit-tipo_vivienda"
            value={values.tipo_vivienda ?? ""}
            onChange={(v) => onChange("tipo_vivienda", v as PersonCreate["tipo_vivienda"])}
            options={VIVIENDA_OPCIONES}
          />
          <SelectField
            label="Nivel de estudios"
            id="edit-nivel_estudios"
            value={values.nivel_estudios ?? ""}
            onChange={(v) => onChange("nivel_estudios", v as PersonCreate["nivel_estudios"])}
            options={NIVEL_ESTUDIOS_LABELS}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="Situación laboral"
            id="edit-situacion_laboral"
            value={values.situacion_laboral ?? ""}
            onChange={(v) => onChange("situacion_laboral", v as PersonCreate["situacion_laboral"])}
            options={SITUACION_LABORAL_LABELS}
          />
          <SelectField
            label="Situación ante el empleo (IRPF)"
            id="edit-situacion_ante_empleo"
            value={values.situacion_ante_empleo ?? ""}
            onChange={(v) => onChange("situacion_ante_empleo", v as PersonCreate["situacion_ante_empleo"])}
            options={SITUACION_ANTE_EMPLEO_LABELS}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="Ingresos aproximados"
            id="edit-nivel_ingresos"
            value={values.nivel_ingresos ?? ""}
            onChange={(v) => onChange("nivel_ingresos", v as PersonCreate["nivel_ingresos"])}
            options={NIVEL_INGRESOS_LABELS}
          />
          <div className="flex items-end gap-2 pb-1">
            <Checkbox
              id="edit-empadronado"
              checked={values.empadronado ?? false}
              onCheckedChange={(v) => onChange("empadronado", v === true)}
            />
            <Label htmlFor="edit-empadronado" className="cursor-pointer">
              Empadronado/a en Madrid
            </Label>
          </div>
        </div>
      </Seccion>
    </div>
  );
}
