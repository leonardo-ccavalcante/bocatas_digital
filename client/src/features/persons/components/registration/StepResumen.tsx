import { CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type PersonCreate,
  CANAL_LLEGADA_LABELS,
  GENERO_LABELS,
  IDIOMA_LABELS,
  PAIS_LABELS,
  TIPO_DOCUMENTO_LABELS,
} from "../../schemas";
import { CONSENT_PURPOSE_LABELS, type ProgramRow } from "../RegistrationWizard/_shared";

interface StepResumenProps {
  values: PersonCreate;
  programs: readonly Pick<ProgramRow, "id" | "name">[];
  consentChoices: Record<string, boolean>;
  groupAPurposes: string[];
  groupBPurposes: string[];
  groupCPurposes: string[];
  hasFamilia: boolean;
  numAdultos: number;
  numMenores: number;
}

const DASH = "—";

function label(map: Record<string, string>, key: string | null | undefined): string {
  if (!key) return DASH;
  return map[key] ?? key;
}

function ConsentBadge({
  label: text,
  granted,
  required,
}: {
  label: string;
  granted: boolean;
  required: boolean;
}) {
  const Icon = granted ? CheckCircle2 : required ? XCircle : MinusCircle;
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-xl border p-2.5 text-body-sm",
        granted
          ? "border-primary/30 bg-primary/5"
          : required
            ? "border-destructive/30 bg-destructive/5"
            : "border-border bg-muted"
      )}
    >
      <span className="font-medium text-foreground">{text}</span>
      <span className="flex items-center gap-1 text-xs font-semibold">
        <Icon
          className={cn(
            "h-3.5 w-3.5",
            granted ? "text-primary" : required ? "text-destructive" : "text-muted-foreground"
          )}
          aria-hidden="true"
        />
        <span
          className={cn(
            granted ? "text-primary" : required ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {granted ? "Firmado" : required ? "Pendiente" : DASH}
        </span>
      </span>
    </div>
  );
}

/**
 * StepResumen — final review screen ported from the v4 prototype (Paso 4).
 *
 * Reads ONLY the live form values (via getValues) and the in-component consent
 * / family state. No fabricated data, no separate validation: this is a
 * read-only summary before the existing submit path runs.
 */
export function StepResumen({
  values,
  programs,
  consentChoices,
  groupAPurposes,
  groupBPurposes,
  groupCPurposes,
  hasFamilia,
  numAdultos,
  numMenores,
}: StepResumenProps) {
  const fullName = `${values.nombre ?? ""} ${values.apellidos ?? ""}`.trim() || DASH;
  const programNames = programs
    .filter((p) => (values.program_ids ?? []).includes(p.id))
    .map((p) => p.name);

  const rows: Array<[string, string]> = [
    ["Nombre completo", fullName],
    ["Fecha de nacimiento", values.fecha_nacimiento || DASH],
    ["Género", label(GENERO_LABELS, values.genero)],
    ["País de origen", label(PAIS_LABELS, values.pais_origen)],
    ["Idioma principal", label(IDIOMA_LABELS, values.idioma_principal)],
    ["Canal de llegada", label(CANAL_LLEGADA_LABELS, values.canal_llegada)],
    ["Tipo de documento", label(TIPO_DOCUMENTO_LABELS, values.tipo_documento)],
    ["Nº de documento", values.numero_documento || DASH],
    ["Teléfono", values.telefono || DASH],
    ["Email", values.email || DASH],
    ["Dirección", values.direccion || DASH],
    ["Municipio", values.municipio || DASH],
  ];

  // Group A (Bocatas) + Group B (Banco de Alimentos) are required. Group C
  // (compartir_datos_red) is intentionally optional, so it is excluded here.
  const allRequired = new Set([...groupAPurposes, ...groupBPurposes]);

  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div
            key={k}
            className="flex items-baseline justify-between gap-3 border-b border-border pb-2.5"
          >
            <dt className="text-body-sm text-muted-foreground">{k}</dt>
            <dd className="truncate text-right text-body-sm font-medium text-foreground">{v}</dd>
          </div>
        ))}
      </dl>

      <div>
        <p className="text-eyebrow text-muted-foreground">Programas al alta</p>
        <p className="mt-1.5 text-body font-medium text-foreground">
          {programNames.length > 0 ? programNames.join(", ") : DASH}
        </p>
        {hasFamilia && (
          <p className="mt-1 text-body-sm text-muted-foreground">
            Programa Familias · {numAdultos + numMenores} miembro
            {numAdultos + numMenores !== 1 ? "s" : ""} ({numAdultos} adulto
            {numAdultos !== 1 ? "s" : ""}, {numMenores} menor{numMenores !== 1 ? "es" : ""})
          </p>
        )}
      </div>

      <div>
        <p className="text-eyebrow text-muted-foreground">Consentimientos</p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[...groupAPurposes, ...groupBPurposes, ...groupCPurposes].map((purpose) => (
            <ConsentBadge
              key={purpose}
              label={CONSENT_PURPOSE_LABELS[purpose] ?? purpose}
              granted={consentChoices[purpose] === true}
              required={allRequired.has(purpose)}
            />
          ))}
        </div>
      </div>

      {values.observaciones && (
        <div className="rounded-xl border border-border bg-muted p-3 text-body-sm text-foreground">
          {values.observaciones}
        </div>
      )}
    </div>
  );
}
