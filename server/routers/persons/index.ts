/**
 * persons/index.ts — barrel that merges sub-routers for person management.
 *
 * Procedures (preserved verbatim from the pre-split persons.ts):
 *   crud.ts:     create, getById, getAll, search
 *   enroll.ts:   enroll
 *   consents.ts: programs, consentTemplates, saveConsents
 *   photo.ts:    uploadPhoto
 *   family.ts:   createFamily
 *   admin.ts:    updateRole, updateFaseItinerario
 *   history.ts:  getCheckinHistory
 *   qr.ts:       getQrPayload, getCheckinTarget    (Phase 6 QA-1A)
 */

import { router } from "../../_core/trpc";
import { crudRouter } from "./crud";
import { enrollRouter } from "./enroll";
import { consentsRouter } from "./consents";
import { photoRouter } from "./photo";
import { familyRouter } from "./family";
import { adminRouter } from "./admin";
import { historyRouter } from "./history";
import { qrRouter } from "./qr";

export const personsRouter = router({
  create: crudRouter.create,
  getById: crudRouter.getById,
  getAll: crudRouter.getAll,
  search: crudRouter.search,
  enroll: enrollRouter.enroll,
  programs: consentsRouter.programs,
  consentTemplates: consentsRouter.consentTemplates,
  saveConsents: consentsRouter.saveConsents,
  uploadPhoto: photoRouter.uploadPhoto,
  createFamily: familyRouter.createFamily,
  updateRole: adminRouter.updateRole,
  updateFaseItinerario: adminRouter.updateFaseItinerario,
  getCheckinHistory: historyRouter.getCheckinHistory,
  getQrPayload: qrRouter.getQrPayload,
  getCheckinTarget: qrRouter.getCheckinTarget,
});
