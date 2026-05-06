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
 *   Writes (protectedProcedure):
 *     - dismissUrgent
 *   Misc:
 *     - uploadImage (delegated to ../announcements.uploadImage)
 */

import { router } from "../../_core/trpc";
import { readsRouter } from "./reads";
import { adminReadsRouter } from "./adminReads";
import { crudRouter } from "./crud";
import { bulkImportRouter } from "./bulk-import";
import { dismissalsRouter } from "./dismissals";
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
  // Writes (protectedProcedure)
  dismissUrgent: dismissalsRouter.dismissUrgent,
  // Misc
  uploadImage: uploadImageProcedure,
});
