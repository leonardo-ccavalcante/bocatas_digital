/**
 * entregas/index.ts — barrel that merges sub-routers for the
 * deliveries (entregas) feature.
 *
 * Procedures (preserved verbatim from the pre-split entregas.ts):
 *   ocr.ts:       extractFromPhoto, extractFromOCR, saveBatch
 *   crud.ts:      getDeliveries, getDeliveryById, createDelivery,
 *                 updateDelivery, deleteDelivery
 *   sessions.ts:  getBatchesByFamilia, getBatchDetails
 *   csv.ts:       downloadTemplate
 *   photo.ts:     uploadPhotoToStorage
 *
 * Re-exports the Entrega type so any consumer that imported it from
 * "../routers/entregas" keeps working through this barrel.
 */

import { router } from "../../_core/trpc";
import { ocrRouter } from "./ocr";
import { crudRouter } from "./crud";
import { sessionsRouter } from "./sessions";
import { csvRouter } from "./csv";
import { photoRouter } from "./photo";

export type { Entrega } from "./_shared";

export const entregasRouter = router({
  extractFromPhoto: ocrRouter.extractFromPhoto,
  extractFromOCR: ocrRouter.extractFromOCR,
  saveBatch: ocrRouter.saveBatch,
  getDeliveries: crudRouter.getDeliveries,
  getDeliveryById: crudRouter.getDeliveryById,
  createDelivery: crudRouter.createDelivery,
  updateDelivery: crudRouter.updateDelivery,
  deleteDelivery: crudRouter.deleteDelivery,
  getBatchesByFamilia: sessionsRouter.getBatchesByFamilia,
  getBatchDetails: sessionsRouter.getBatchDetails,
  downloadTemplate: csvRouter.downloadTemplate,
  uploadPhotoToStorage: photoRouter.uploadPhotoToStorage,
});
