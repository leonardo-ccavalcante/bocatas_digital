// Barrel — re-exports helpers split into ./announcements/helpers/*
// for the 400-line cap. Keep this barrel because it has 5+ test importers.

export {
  isVisibleToUser,
  type VisibilityInput,
} from "./announcements/helpers/visibility";

export {
  diffForAudit,
  type AuditChange,
} from "./announcements/helpers/audit";

export { shouldFireWebhook } from "./announcements/helpers/webhook";

export {
  parseAudienciasDSL,
  type DSLParseResult,
} from "./announcements/helpers/dsl";

export {
  validateBulkRow,
  type BulkRowInput,
  type BulkRowError,
  type ParsedBulkRow,
} from "./announcements/helpers/bulkRow";

// Re-export types used by callers so they only need one import
export type {
  TipoAnnouncement,
  AnnouncementRole,
  AnnouncementProgram,
  AudienceRule,
} from "../shared/announcementTypes";
export {
  ANNOUNCEMENT_TYPES,
  LEGACY_ANNOUNCEMENT_TYPES,
  ANNOUNCEMENT_ROLES,
  ANNOUNCEMENT_PROGRAMS,
  isCurrentTipo,
  isLegacyTipo,
} from "../shared/announcementTypes";
