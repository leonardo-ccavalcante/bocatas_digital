/**
 * announcements/index.ts — barrel that merges sub-routers for the
 * Novedades (Announcements) feature.
 *
 * Procedures (preserved verbatim from the pre-split announcements.ts):
 *   Reads (protectedProcedure):
 *     - getAll, getById, getUrgentBannerAnnouncement
 *   Reads (adminProcedure):
 *     - getAudiencesByAnnouncementId, getAuditLog, getDismissalStats
 *   Writes (adminProcedure):
 *     - create, update, delete, togglePin
 *     - previewBulkImport, confirmBulkImport
 *   Misc:
 *     - uploadImage (delegated to ../announcements.uploadImage)
 *
 * Removed: `dismissUrgent` (was: protectedProcedure write to
 * `announcement_dismissals.person_id`). Wrote `String(ctx.user.id)` —
 * a stringified MySQL int — into a column whose RLS policy expects
 * `auth.uid()` (a UUID). Re-enable only after Supabase JWT auth lands
 * and beneficiarios are provisioned with `auth.users.id = persons.id`.
 * The banner UI dismissal is now per-session (component state) only.
 */

import { router } from "../../_core/trpc";
import { readsRouter } from "./reads";
import { adminReadsRouter } from "./adminReads";
import { crudRouter } from "./crud";
import { bulkImportRouter } from "./bulk-import";
import { uploadImageProcedure } from "../announcements.uploadImage";

export const announcementsRouter = router({
  // Reads (protectedProcedure)
  getAll: readsRouter.getAll,
  getById: readsRouter.getById,
  getUrgentBannerAnnouncement: readsRouter.getUrgentBannerAnnouncement,
  // Reads (adminProcedure)
  getAudiencesByAnnouncementId: adminReadsRouter.getAudiencesByAnnouncementId,
  getAuditLog: adminReadsRouter.getAuditLog,
  getDismissalStats: adminReadsRouter.getDismissalStats,
  // Writes (adminProcedure)
  create: crudRouter.create,
  update: crudRouter.update,
  delete: crudRouter.delete,
  togglePin: crudRouter.togglePin,
  previewBulkImport: bulkImportRouter.previewBulkImport,
  confirmBulkImport: bulkImportRouter.confirmBulkImport,
  // Misc
  uploadImage: uploadImageProcedure,
});
