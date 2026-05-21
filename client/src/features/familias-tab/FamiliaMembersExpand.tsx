import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { FamiliaMemberRow, type FamiliaMemberRowMember } from "./FamiliaMemberRow";

/**
 * Inline expandable member sub-table for one family. Fetches the family's
 * members (`families.getMembers`) and per-member documents
 * (`families.getMemberDocuments`) and renders one <FamiliaMemberRow> each.
 *
 * Both queries are existing tRPC procedures — no contract change. Member doc
 * status is built from real `family_member_documents` rows; absent docs render
 * as a neutral/pending dot, never a fabricated "complete" state.
 */

interface FamiliaMembersExpandProps {
  familyId: string;
  /** Total column count of the parent table, for the colspan wrapper cell. */
  colSpan: number;
}

interface MemberRow extends FamiliaMemberRowMember {
  familia_id?: string;
}

interface DocRow {
  documento_tipo: string;
  documento_url: string | null;
  member_index: number;
  member_id: string | null;
  is_current: boolean | null;
}

export function FamiliaMembersExpand({ familyId, colSpan }: FamiliaMembersExpandProps) {
  const { data: members, isLoading: membersLoading } =
    trpc.families.getMembers.useQuery({ familiaId: familyId });
  const { data: docs, isLoading: docsLoading } =
    trpc.families.getMemberDocuments.useQuery({ family_id: familyId });

  const memberRows = (members ?? []) as MemberRow[];
  const docRows = (docs ?? []) as DocRow[];

  // Map member (by stable familia_miembros.id) → set of uploaded doc tipos.
  // family_member_documents links via member_id (preferred) or member_index.
  // Only rows with is_current=true are treated as complete — superseded uploads
  // (is_current=false) must not mark a doc as done (IMPORTANT 1 guard).
  const uploadedByMemberId = new Map<string, Set<string>>();
  // Positional fallback: approximate after soft-deletes. The stored member_index
  // diverges from render-array position once any member is soft-deleted.
  // The stable member_id path (preferred, written post-migration) covers any doc
  // row that has a FK link; only pre-migration rows fall through to this map.
  const uploadedByIndex = new Map<number, Set<string>>();
  for (const d of docRows) {
    // Skip rows without a URL or that are not the current version.
    if (!d.documento_url || d.is_current === false) continue;
    if (d.member_id) {
      // Preferred: stable FK path.
      const set = uploadedByMemberId.get(d.member_id) ?? new Set<string>();
      set.add(d.documento_tipo);
      uploadedByMemberId.set(d.member_id, set);
    } else {
      // Positional fallback for pre-migration rows that lack a member_id.
      const idxSet = uploadedByIndex.get(d.member_index) ?? new Set<string>();
      idxSet.add(d.documento_tipo);
      uploadedByIndex.set(d.member_index, idxSet);
    }
  }

  const isLoading = membersLoading || docsLoading;

  return (
    <tr id={`members-${familyId}`} className="border-t border-border bg-muted/40">
      <td colSpan={colSpan} className="px-5 py-4">
        <div className="bocatas-card overflow-hidden rounded-xl p-0">
          <div className="flex items-center justify-between border-b border-border bg-muted/60 px-4 py-2">
            <p className="text-eyebrow text-muted-foreground">
              Miembros de la familia ({memberRows.length})
            </p>
            <Link
              href={`/familias/${familyId}`}
              className="inline-flex items-center gap-1 text-body-sm font-semibold text-primary hover:underline"
            >
              Ver ficha completa
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
          {isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : memberRows.length === 0 ? (
            <p className="px-4 py-6 text-center text-body-sm text-muted-foreground">
              Sin miembros registrados.
            </p>
          ) : (
            <table className="w-full text-sm" aria-label="Miembros de la familia">
              <thead className="text-eyebrow text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">Nombre</th>
                  <th className="px-2 py-2 text-left">Parentesco</th>
                  <th className="px-2 py-2 text-center">Edad</th>
                  <th className="px-4 py-2 text-left">Documentación</th>
                </tr>
              </thead>
              <tbody>
                {memberRows.map((m, i) => (
                  <FamiliaMemberRow
                    key={m.id}
                    member={m}
                    uploadedTipos={
                      uploadedByMemberId.get(m.id) ??
                      // Positional fallback (i+1 = render-array position) is
                      // approximate after a soft-delete: the stored member_index
                      // in family_member_documents no longer matches the render
                      // position once any earlier member is deleted. The stable
                      // member_id path above covers all post-migration rows.
                      uploadedByIndex.get(i + 1) ??
                      new Set<string>()
                    }
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </td>
    </tr>
  );
}
