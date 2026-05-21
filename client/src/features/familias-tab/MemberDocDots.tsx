import { Check } from "lucide-react";
import { ageInYears } from "@/features/families/utils/age";
import { PER_MEMBER_DOC_TYPES } from "@shared/familyDocuments";

/**
 * Per-member document-status dots. Derives state from REAL
 * `family_member_documents` rows (passed in via `uploadedTipos`) keyed by the
 * shared `PER_MEMBER_DOC_TYPES` catalogue — never fabricated.
 *
 * - ok = true  → a current document_url exists for that tipo (green ✓)
 * - ok = false → required for this member, not yet uploaded (red)
 * - ok = null  → does not apply (member < 14): consents are N/A (neutral dashed)
 *
 * Minors (<14) only need an identity document (optional); consents do not apply.
 * Members with unknown DOB are treated as adults (inclusive — show the
 * requirement rather than hide it), matching `isAdultOrUnknown`.
 */

const DOC_LABELS: Record<(typeof PER_MEMBER_DOC_TYPES)[number], string> = {
  documento_identidad: "DNI / Pasaporte",
  consent_bocatas: "Consent. Bocatas",
  consent_banco_alimentos: "Consent. Banco Alim.",
};

type DocState = { key: string; label: string; ok: boolean | null };

export interface MemberDocDotsProps {
  /** Document tipos that have a current uploaded file for this member. */
  uploadedTipos: ReadonlySet<string>;
  /** Member date of birth (ISO yyyy-mm-dd) — drives age-based requirements. */
  fechaNacimiento?: string | null;
}

/** Pure: compute the three doc states for a member from real uploaded tipos. */
export function computeMemberDocStates(
  uploadedTipos: ReadonlySet<string>,
  fechaNacimiento?: string | null,
): { docs: DocState[]; adult: boolean } {
  const age = ageInYears(fechaNacimiento);
  const adult = age === null || age >= 14;
  const docs: DocState[] = PER_MEMBER_DOC_TYPES.map((tipo) => {
    const uploaded = uploadedTipos.has(tipo);
    if (!adult && tipo !== "documento_identidad") {
      // Consents do not apply to minors.
      return { key: tipo, label: DOC_LABELS[tipo], ok: null };
    }
    return { key: tipo, label: DOC_LABELS[tipo], ok: uploaded };
  });
  return { docs, adult };
}

function dotClasses(ok: boolean | null): string {
  if (ok === true) return "bg-green-600 text-white";
  if (ok === false) return "bg-red-600 text-white ring-2 ring-red-600/15";
  return "bg-muted border border-dashed border-muted-foreground/60";
}

function dotTitle(label: string, ok: boolean | null): string {
  if (ok === true) return `${label}: entregado`;
  if (ok === false) return `${label}: pendiente`;
  return `${label}: no aplica`;
}

export function MemberDocDots({ uploadedTipos, fechaNacimiento }: MemberDocDotsProps) {
  const { docs, adult } = computeMemberDocStates(uploadedTipos, fechaNacimiento);
  const completed = docs.filter((d) => d.ok === true).length;
  const required = adult ? docs.length : 0;

  return (
    <div className="flex items-center gap-3">
      <div className="relative flex w-24 items-center">
        <span
          className="absolute left-2 right-2 top-1/2 -translate-y-1/2 h-px bg-border"
          aria-hidden="true"
        />
        <div className="relative flex items-center justify-between w-full">
          {docs.map((d) => (
            <span
              key={d.key}
              title={dotTitle(d.label, d.ok)}
              aria-label={dotTitle(d.label, d.ok)}
              className={`inline-flex h-3 w-3 items-center justify-center rounded-full outline outline-2 outline-background ${dotClasses(d.ok)}`}
            >
              {d.ok === true && <Check className="h-2 w-2" strokeWidth={3} aria-hidden="true" />}
            </span>
          ))}
        </div>
      </div>
      <span className="text-body-sm tabular-stat text-muted-foreground whitespace-nowrap">
        {adult ? `${completed}/${required}` : <span className="italic">no aplica</span>}
      </span>
    </div>
  );
}
