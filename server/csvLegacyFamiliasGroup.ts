// Group + validate clean rows from the legacy FAMILIAS CSV.
//
// Pure functions: no DB access. Dedup-against-DB and family_already_imported
// flags are populated by the router after these functions return — the group
// helpers only handle the cross-row structural validation (one-titular-per-family).

import type {
  CleanRow,
  FamilyGroup,
  GroupError,
} from "../shared/legacyFamiliasTypes";

export function groupByFamilyNumber(
  rows: ReadonlyArray<CleanRow>
): Map<string, CleanRow[]> {
  const groups = new Map<string, CleanRow[]>();
  for (const r of rows) {
    const key = r.legacy_numero_familia;
    const existing = groups.get(key);
    if (existing) {
      existing.push(r);
    } else {
      groups.set(key, [r]);
    }
  }
  return groups;
}

export interface ValidatedGroup {
  rows: CleanRow[];
  titular_index: number;
  errors: GroupError[];
}

export function validateGroup(rows: ReadonlyArray<CleanRow>): ValidatedGroup {
  const errors: GroupError[] = [];
  const titulares = rows
    .map((r, idx) => ({ r, idx }))
    .filter((x) => x.r.is_titular);

  if (titulares.length === 0) {
    errors.push({
      field: "cabeza_familia",
      message: "El grupo no tiene ningún titular ('x' en CABEZA DE FAMILIA).",
    });
    return { rows: [...rows], titular_index: 0, errors };
  }

  if (titulares.length > 1) {
    errors.push({
      field: "cabeza_familia",
      message: `El grupo tiene varios titulares (${titulares.length}); solo uno permitido.`,
    });
    // Surface the issue but still build a usable shape — first titular wins.
  }

  // Reorder so the (first) titular sits at index 0; preserve the order of dependents.
  const titularIdx = titulares[0].idx;
  const reordered: CleanRow[] = [];
  reordered.push(rows[titularIdx]);
  for (let i = 0; i < rows.length; i++) {
    if (i === titularIdx) continue;
    reordered.push(rows[i]);
  }

  return { rows: reordered, titular_index: 0, errors };
}

export function assembleFamilyGroups(
  rows: ReadonlyArray<CleanRow>
): FamilyGroup[] {
  const grouped = groupByFamilyNumber(rows);
  const out: FamilyGroup[] = [];
  for (const [legacy_numero_familia, groupRows] of grouped) {
    const v = validateGroup(groupRows);
    out.push({
      legacy_numero_familia,
      rows: v.rows,
      titular_index: v.titular_index,
      family_already_imported: false,
      errors: v.errors,
      person_dedup_hits: [],
    });
  }
  return out;
}
