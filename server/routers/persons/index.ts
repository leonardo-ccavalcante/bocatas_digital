/**
 * persons/index.ts — barrel that merges sub-routers for person management.
 *
 * Procedures (preserved verbatim from the pre-split persons.ts):
 *   crud.ts:     create, getById, getAll, findDuplicates
 *   search.ts:   search  (nombre/apellidos + nº de documento + teléfono)
 *   update.ts:   update (admin), softDelete (superadmin)  — #177
 *   enroll.ts:   enroll
 *   consents.ts: programs, consentTemplates, saveConsents, getPersonConsents
 *   photo.ts:    uploadPhoto
 *   family.ts:   createFamily
 *   admin.ts:    updateRole, updateFaseItinerario
 *   history.ts:  getCheckinHistory
 *   qr.ts:       getQrPayload, getCheckinTarget    (Phase 6 QA-1A)
 *   documents.ts: getDocumentUrls, getPersonIdsWithDocuments (superadmin)
 */

import { router } from "../../_core/trpc";
import { crudRouter } from "./crud";
import { searchPersons } from "./search";
import { updatePerson, softDeletePerson } from "./update";
import { enrollRouter } from "./enroll";
import { consentsRouter } from "./consents";
import { photoRouter } from "./photo";
import { familyRouter } from "./family";
import { adminRouter } from "./admin";
import { historyRouter } from "./history";
import { qrRouter } from "./qr";
import { getDocumentUrls, getPersonIdsWithDocuments } from "./documents";

export const personsRouter = router({
  create: crudRouter.create,
  getById: crudRouter.getById,
  getAll: crudRouter.getAll,
  search: searchPersons,
  update: updatePerson,
  softDelete: softDeletePerson,
  enroll: enrollRouter.enroll,
  programs: consentsRouter.programs,
  consentTemplates: consentsRouter.consentTemplates,
  saveConsents: consentsRouter.saveConsents,
  getPersonConsents: consentsRouter.getPersonConsents,
  uploadPhoto: photoRouter.uploadPhoto,
  createFamily: familyRouter.createFamily,
  updateRole: adminRouter.updateRole,
  updateFaseItinerario: adminRouter.updateFaseItinerario,
  getCheckinHistory: historyRouter.getCheckinHistory,
  getQrPayload: qrRouter.getQrPayload,
  getCheckinTarget: qrRouter.getCheckinTarget,
  findDuplicates: crudRouter.findDuplicates,
  getDocumentUrls,
  getPersonIdsWithDocuments,
});
