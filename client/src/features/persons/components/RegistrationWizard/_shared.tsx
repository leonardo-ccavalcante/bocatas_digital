import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ConsentLanguageSchema, type PersonCreate } from "../../schemas";

export interface FamilyMember {
  nombre: string;
  apellidos: string;
  fecha_nacimiento: string;
  parentesco: string;
}

/**
 * Program row shape as returned by usePrograms (DB columns; icon nullable).
 * Single source — imported by the wizard phases, social step, and resumen
 * (which only needs `Pick<ProgramRow, "id" | "name">`).
 */
export interface ProgramRow {
  id: string;
  name: string;
  icon: string | null;
  slug: string;
  // Árbol de programas (ADR-0013). Opcionales: el fallback de semilla de
  // labels.ts y los mocks de los tests no los traen.
  parent_id?: string | null;
  tipo?: string | null;
  inscribible?: boolean;
}

/**
 * Consent template languages (consent_language enum). Single source derived
 * from the canonical Zod enum — a person whose idioma_principal is outside
 * this set has no template and triggers the verbal-translation fallback
 * banner. Used by both ConsentModal and the RegistrationWizard so the rule
 * cannot drift.
 */
export const TEMPLATE_LANGUAGES = new Set<string>(ConsentLanguageSchema.options);

export const CONSENT_PURPOSE_LABELS: Record<string, string> = {
  tratamiento_datos_bocatas: "Tratamiento de datos — Bocatas Digital",
  tratamiento_datos_banco_alimentos: "Tratamiento de datos — Banco de Alimentos",
  compartir_datos_red: "Compartir datos en red (Programa Familias)",
  comunicaciones_whatsapp: "Comunicaciones por WhatsApp",
  fotografia: "Uso de fotografía e imagen",
};

/**
 * Programa Familias. Es el único slug que el código tiene que reconocer: dispara
 * el paso de composición del hogar y los consentimientos de Banco de Alimentos y
 * de compartir datos en red. El catálogo es dinámico (ADR-0013) y nadie más debe
 * enumerarlo.
 *
 * Esta constante se quedó en `"familia"` cuando la migración 20260507000002
 * renombró el slug, y como sólo se compara —nunca se busca— el fallo fue mudo
 * durante meses. La ata a la migración `__tests__/programSlugs.test.ts`.
 */
export const SLUG_PROGRAMA_FAMILIAS = "programa_familias";

// Per-phase validation fields for the wizard's goNext() gate (react-hook-form
// trigger()). Indexes 0-2 = phases 1-3; phase 4 (Resumen) submits via
// handleFinalSubmit. Every phase's format-validated inputs must be listed here
// or their errors surface only as a server 400 at submit (QA F047/F058).
// Phase 1 = Canal + Identidad + Documento · Phase 2 = Contacto + Situación
// (see WizardPhases.tsx) · Phase 3 fields are free-text/selects with no
// format rules beyond max-length.
export const PHASE_FIELDS: readonly (keyof PersonCreate)[][] = [
  ["canal_llegada", "nombre", "apellidos", "fecha_nacimiento", "idioma_principal", "fecha_llegada_espana"],
  ["telefono", "email", "direccion", "codigo_postal", "municipio", "barrio_zona"],
  [],
];

export function SelectField({
  label, id, value, onChange, options, placeholder, required,
  "aria-describedby": ariaDescribedby, "aria-invalid": ariaInvalid,
}: {
  label: string; id: string; value: string; onChange: (v: string) => void;
  options: Record<string, string>; placeholder?: string; required?: boolean;
  "aria-describedby"?: string; "aria-invalid"?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      <Select value={value ?? ""} onValueChange={onChange}>
        <SelectTrigger id={id} aria-describedby={ariaDescribedby} aria-invalid={ariaInvalid}>
          <SelectValue placeholder={placeholder ?? "Seleccionar..."} />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(options).map(([k, v]) => (
            <SelectItem key={k} value={k}>{v}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function FieldError({ id, message }: { id?: string; message?: string }) {
  if (!message) return null;
  return <p id={id} role="alert" className="mt-0.5 text-xs text-destructive">{message}</p>;
}
