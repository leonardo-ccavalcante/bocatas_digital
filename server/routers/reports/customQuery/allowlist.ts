/**
 * customQuery/allowlist.ts — Re-exports and helpers for the field allowlist.
 *
 * This thin module exists so executor.ts and saved.ts can import the allowlist
 * without importing the full entities.ts surface (keeping coupling explicit).
 */

export {
  ENTITY_FIELDS,
  ENTITY_TO_TABLE,
  HIGH_RISK_PII_FIELDS,
  REPORT_ENTITIES,
  isFieldAllowed,
  type ReportEntity,
  type FieldDef,
} from "../../../../shared/reports/entities";

export {
  SavedQuerySpecSchema,
  type SavedQuerySpec,
  type FilterRow,
  type ParsedFilterRow,
} from "../../../../shared/reports/savedQuerySpec";
