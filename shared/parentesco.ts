/**
 * Single source of truth for `familia_miembros.relacion` (parentesco) → Spanish label.
 *
 * The DB CHECK on this one column allows TWO historical vocabularies:
 *   - HSDS-style English : parent, child, sibling, other
 *   - legacy Spanish slugs: esposo_a, hijo_a, madre, padre, suegro_a,
 *                           hermano_a, abuelo_a, otro
 * Both must render in Spanish EVERYWHERE — member lists, family detail, and the
 * official DOCX informe de valoración social (Banco de Alimentos). A raw English
 * token ("child", "other") in a legal document is a real defect, so every render
 * site routes through here instead of printing the stored value.
 */
export const RELACION_LABEL_ES: Record<string, string> = {
  // HSDS-style English (what the member-management modal writes)
  parent: "Padre/Madre",
  child: "Hijo/a",
  sibling: "Hermano/a",
  other: "Otro",
  // Legacy Spanish slugs (intake wizard / CSV import)
  esposo_a: "Esposo/a",
  hijo_a: "Hijo/a",
  madre: "Madre",
  padre: "Padre",
  suegro_a: "Suegro/a",
  hermano_a: "Hermano/a",
  abuelo_a: "Abuelo/a",
  otro: "Otro",
};

/**
 * Map a raw `relacion` value to its Spanish label. Unknown/blank values return
 * `fallback` (default ""), so callers decide what to show for corrupt data —
 * never a raw English token leaking into a document.
 */
export function parentescoLabelEs(relacion?: string | null, fallback = ""): string {
  if (!relacion) return fallback;
  return RELACION_LABEL_ES[relacion] ?? fallback;
}
