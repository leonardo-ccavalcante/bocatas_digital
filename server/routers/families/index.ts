import { mergeRouters } from "../../_core/trpc";

import { crudRouter } from "./crud";
import { membersRouter } from "./members";
import { documentsRouter } from "./documents";
import { complianceRouter } from "./compliance";
import { sessionsRouter } from "./sessions";
import { csvExportRouter } from "./csv-export";
import { csvImportRouter } from "./csv-import";
import { legacyImportRouter } from "./legacy-import";
import { informesImportRouter } from "./informes-import";
import { followUpsRouter } from "./follow-ups";
import { documentsGenRouter } from "./documents-gen";
import { templateEditorRouter } from "./template-editor";
import { roundsScheduleRouter } from "./rounds-schedule";
import { roundsCloseoutRouter } from "./rounds-closeout";
import { roundsDocumentsRouter } from "./rounds-documents";
import { roundsOcrRouter } from "./rounds-ocr";

// Re-export helpers used by other routers (server/routers/persons.ts imports
// insertFamilyRow + mirrorMembersToTable from "./families"). Preserves the
// public surface of the old monolithic families.ts.
export {
  insertFamilyRow,
  mirrorMembersToTable,
  mapParentescoToRelacion,
  resolveMemberPersonId,
  ensureFamiliaEnrollment,
  uuidLike,
  programIdSchema,
  SENTINEL_UUID,
  FamilyMemberSchema,
  DeactivateFamilyInputSchema,
  familyDocTypeSchema,
} from "./_shared";
export type { MirrorMember, FamiliesUpdate } from "./_shared";

export const familiesRouter = mergeRouters(
  crudRouter,
  membersRouter,
  documentsRouter,
  complianceRouter,
  sessionsRouter,
  csvExportRouter,
  csvImportRouter,
  legacyImportRouter,
  informesImportRouter,
  followUpsRouter,
  documentsGenRouter,
  templateEditorRouter,
  roundsScheduleRouter,
  roundsCloseoutRouter,
  roundsDocumentsRouter,
  roundsOcrRouter,
);
