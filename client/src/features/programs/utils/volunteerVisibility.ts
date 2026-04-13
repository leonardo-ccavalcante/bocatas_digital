/**
 * Filters table columns based on volunteer_visible_fields configuration.
 *
 * Rules:
 * - Admin always sees all columns
 * - Empty volunteerVisibleFields = no restrictions (show all)
 * - Non-empty volunteerVisibleFields = only show listed columns
 * - 'estado' column is always visible (required for UX)
 */
export function filterVisibleColumns(
  allColumns: string[],
  volunteerVisibleFields: string[],
  isAdmin: boolean
): string[] {
  // Admins see everything
  if (isAdmin) return allColumns;

  // Empty = no restrictions
  if (volunteerVisibleFields.length === 0) return allColumns;

  // Filter to allowed columns, always include 'estado'
  const allowed = new Set([...volunteerVisibleFields, 'estado']);
  return allColumns.filter((col) => allowed.has(col));
}
