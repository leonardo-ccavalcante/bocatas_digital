import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { FamilyIntake, FamilyMember } from "../../schemas";

/**
 * Los seis interruptores escriben en columnas booleanas de `families`: son del
 * HOGAR, no de una persona. Pero identidad y los dos consentimientos el dominio
 * los trata por miembro ≥14 (PER_MEMBER_DOC_TYPES), y al leerlos sueltos el
 * voluntario no sabía de quién hablaba (FAMILIAS-1).
 *
 * Se separan los dos bloques y se dice con nombre y apellidos a quién cubre el
 * segundo. El archivo de cada miembro se sube después en la ficha de la familia
 * (MembersDocsCard): durante el alta los `familia_miembros.id` todavía no
 * existen, así que capturarlos aquí sería otra cosa, no este arreglo.
 */
type DocField = { key: keyof FamilyIntake; label: string };

const DOCS_FAMILIA: DocField[] = [
  { key: "padron_recibido", label: "Padrón municipal recibido" },
  { key: "justificante_recibido", label: "Justificante de ingresos recibido" },
];

const DOCS_MIEMBRO: DocField[] = [
  { key: "docs_identidad", label: "Documentos de identidad recibidos" },
  { key: "consent_bocatas", label: "Consentimiento Bocatas firmado" },
  { key: "consent_banco_alimentos", label: "Consentimiento Banco de Alimentos firmado" },
];

interface Step3DocsProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: any;
  members: FamilyMember[];
}

function DocSwitch({
  campo,
  form,
  required,
}: {
  campo: DocField;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: any;
  required?: boolean;
}) {
  const id = `doc-${String(campo.key)}`;
  return (
    <div className="flex items-center justify-between p-3 border rounded-lg">
      <Label htmlFor={id} className="text-sm">
        {campo.label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      <Switch
        id={id}
        aria-required={required}
        checked={!!form.watch(campo.key)}
        onCheckedChange={(v: boolean) => form.setValue(campo.key, v as never)}
      />
    </div>
  );
}

export function Step3Docs({ form, members }: Step3DocsProps) {
  const nombres = members
    .map((m) => `${m.nombre} ${m.apellidos}`.trim())
    .filter((n) => n.length > 0);
  const cobertura =
    nombres.length > 0
      ? `Aplica al titular y a ${nombres.length} miembro(s): ${nombres.join(", ")}.`
      : "Aplica al titular. Aún no has añadido más miembros al hogar.";

  return (
    <div className="space-y-4">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Documentos de la familia</h3>
        {DOCS_FAMILIA.map((campo) => (
          <DocSwitch key={String(campo.key)} campo={campo} form={form} />
        ))}
        <DocSwitch
          campo={{ key: "informe_social", label: "Informe social recibido" }}
          form={form}
          required
        />
        {form.watch("informe_social") && (
          <div>
            <Label className="text-xs" htmlFor="informe_social_fecha">
              Fecha del informe social <span className="text-destructive">*</span>
            </Label>
            <Input
              id="informe_social_fecha"
              type="date"
              aria-required="true"
              {...form.register("informe_social_fecha")}
            />
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Documentos de cada miembro</h3>
        <p className="text-xs text-muted-foreground" data-testid="cobertura-miembros">
          {cobertura} Marca aquí si ya los tienes de todo el hogar; el archivo de
          cada persona se sube en la ficha de la familia, después de registrarla.
        </p>
        {DOCS_MIEMBRO.map((campo) => (
          <DocSwitch key={String(campo.key)} campo={campo} form={form} />
        ))}
      </section>
    </div>
  );
}
