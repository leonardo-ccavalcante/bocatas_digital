import { ageInYears } from "@/features/families/utils/age";
import { MemberDocDots } from "./MemberDocDots";

/**
 * A single member row inside the inline expandable member sub-table.
 * All fields come from real `familia_miembros` data + `family_member_documents`
 * (passed as `uploadedTipos`). Parentesco is derived from the member's
 * `relacion`/`rol` fields; age from `fecha_nacimiento`. Nothing is fabricated.
 */

export interface FamiliaMemberRowMember {
  id: string;
  nombre: string;
  apellidos?: string | null;
  relacion?: string | null;
  rol?: string | null;
  fecha_nacimiento?: string | null;
}

export interface FamiliaMemberRowProps {
  member: FamiliaMemberRowMember;
  /** Doc tipos uploaded for this specific member (current versions only). */
  uploadedTipos: ReadonlySet<string>;
}

const RELACION_LABELS: Record<string, string> = {
  parent: "Progenitor/a",
  child: "Hijo/a",
  sibling: "Hermano/a",
  other: "Otro",
};

const ROL_LABELS: Record<string, string> = {
  head_of_household: "Titular",
  dependent: "Dependiente",
  other: "Otro",
};

/** Pure: pick the best Spanish parentesco label from rol/relacion, else em-dash. */
export function parentescoLabel(rol?: string | null, relacion?: string | null): string {
  if (rol && ROL_LABELS[rol]) return ROL_LABELS[rol];
  if (relacion && RELACION_LABELS[relacion]) return RELACION_LABELS[relacion];
  return "—";
}

function initials(nombre: string, apellidos?: string | null): string {
  const parts = `${nombre} ${apellidos ?? ""}`.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

export function FamiliaMemberRow({ member, uploadedTipos }: FamiliaMemberRowProps) {
  const fullName = `${member.nombre} ${member.apellidos ?? ""}`.trim();
  const age = ageInYears(member.fecha_nacimiento);

  return (
    <tr className="border-t border-border">
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
            {initials(member.nombre, member.apellidos)}
          </span>
          <span className="font-medium text-foreground">{fullName}</span>
        </div>
      </td>
      <td className="px-2 py-2 text-muted-foreground">
        {parentescoLabel(member.rol, member.relacion)}
      </td>
      <td className="px-2 py-2 text-center tabular-stat" data-testid="member-age">
        {age != null ? age : "—"}
      </td>
      <td className="px-4 py-2">
        <MemberDocDots
          uploadedTipos={uploadedTipos}
          fechaNacimiento={member.fecha_nacimiento}
        />
      </td>
    </tr>
  );
}
