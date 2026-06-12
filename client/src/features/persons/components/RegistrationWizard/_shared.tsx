import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ConsentLanguageSchema } from "../../schemas";

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

// Slugs that trigger extra consent groups
export const SLUG_BANCO_ALIMENTOS = "familia"; // Familia program uses Banco de Alimentos data
export const SLUG_FAMILIA = "familia";

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
