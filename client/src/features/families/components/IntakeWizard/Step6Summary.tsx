import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle, Users, FileText, Shield, User } from "lucide-react";
import { usePrograms } from "@/features/programs/hooks/usePrograms";
import type { FamilyMember } from "../../schemas";

interface Step6SummaryProps {
  titularId: string;
  programId: string;
  members: FamilyMember[];
  docs: {
    docs_identidad: boolean;
    padron_recibido: boolean;
    justificante_recibido: boolean;
    informe_social: boolean;
  };
  consents: {
    consent_bocatas: boolean;
    consent_banco_alimentos: boolean;
  };
  autorizado: boolean;
  personaRecoge?: string;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-right">{value}</dd>
    </div>
  );
}

function YesNo({ on }: { on: boolean }) {
  return on ? (
    <span className="text-green-600 dark:text-green-400">Sí</span>
  ) : (
    <span className="text-muted-foreground">No</span>
  );
}

/**
 * Step 6 — review-before-submit. Surfaces the full ficha so the volunteer
 * confirms what is about to be written, and warns (non-blocking) when the
 * chosen titular already heads an active family — caught via the existing
 * families.getAll, matched by id (no new procedure).
 */
export function Step6Summary({
  titularId,
  programId,
  members,
  docs,
  consents,
  autorizado,
  personaRecoge,
}: Step6SummaryProps) {
  const { data: titular } = trpc.persons.getById.useQuery(
    { id: titularId },
    { enabled: !!titularId }
  );
  const { data: activeFamilies } = trpc.families.getAll.useQuery({});
  const { programs } = usePrograms();

  const programName = programs.find((p) => p.id === programId)?.name ?? "—";
  const adultos = members.filter((m) => !m.es_menor).length + 1; // +1 titular
  const menores = members.filter((m) => m.es_menor).length;

  const duplicate = activeFamilies?.find(
    // persons is the nested titular row from families.getAll
    (f) => (f as { persons?: { id?: string } }).persons?.id === titularId
  ) as { familia_numero?: number } | undefined;

  return (
    <div className="space-y-5">
      {duplicate && (
        <div
          role="alert"
          className="flex items-start gap-3 p-3 border border-amber-300 rounded-lg bg-amber-50 dark:bg-amber-950"
        >
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" aria-hidden="true" />
          <p className="text-sm">
            Esta persona ya es titular de la familia{" "}
            <span className="font-semibold">#{duplicate.familia_numero}</span>. Revisa antes de
            crear una familia duplicada.
          </p>
        </div>
      )}

      <section aria-label="Titular y programa">
        <h3 className="flex items-center gap-2 text-sm font-semibold mb-1">
          <User className="h-4 w-4" aria-hidden="true" /> Titular
        </h3>
        <dl className="border rounded-lg px-3 divide-y">
          <Row
            label="Nombre"
            value={titular ? `${titular.nombre} ${titular.apellidos}` : "…"}
          />
          <Row label="Programa" value={programName} />
        </dl>
      </section>

      <section aria-label="Composición familiar">
        <h3 className="flex items-center gap-2 text-sm font-semibold mb-1">
          <Users className="h-4 w-4" aria-hidden="true" /> Miembros
        </h3>
        <dl className="border rounded-lg px-3 divide-y">
          <Row label="Adultos (incl. titular)" value={adultos} />
          <Row label="Menores de 18" value={menores} />
          <Row label="Miembros adicionales" value={members.length} />
        </dl>
      </section>

      <section aria-label="Documentación y consentimientos">
        <h3 className="flex items-center gap-2 text-sm font-semibold mb-1">
          <FileText className="h-4 w-4" aria-hidden="true" /> Documentación
        </h3>
        <dl className="border rounded-lg px-3 divide-y">
          <Row label="Documentos de identidad" value={<YesNo on={docs.docs_identidad} />} />
          <Row label="Padrón recibido" value={<YesNo on={docs.padron_recibido} />} />
          <Row label="Justificante recibido" value={<YesNo on={docs.justificante_recibido} />} />
          <Row label="Informe social" value={<YesNo on={docs.informe_social} />} />
          <Row label="Consentimiento Bocatas" value={<YesNo on={consents.consent_bocatas} />} />
          <Row
            label="Consentimiento Banco de Alimentos"
            value={<YesNo on={consents.consent_banco_alimentos} />}
          />
        </dl>
      </section>

      <section aria-label="Persona autorizada">
        <h3 className="flex items-center gap-2 text-sm font-semibold mb-1">
          <Shield className="h-4 w-4" aria-hidden="true" /> Autorizado
        </h3>
        <dl className="border rounded-lg px-3 divide-y">
          <Row label="¿Persona autorizada?" value={<YesNo on={autorizado} />} />
          {autorizado && <Row label="Nombre" value={personaRecoge || "—"} />}
        </dl>
      </section>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <CheckCircle className="h-3.5 w-3.5 text-green-600" aria-hidden="true" />
        Revisa los datos y pulsa «Registrar familia» para confirmar.
      </p>
    </div>
  );
}
