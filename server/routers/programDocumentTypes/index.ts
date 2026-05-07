import { mergeRouters } from "../../_core/trpc";
import { programDocumentTypesCrudRouter } from "./crud";
import { programDocumentTypesTemplatesRouter } from "./templates";

export const programDocumentTypesRouter = mergeRouters(
  programDocumentTypesCrudRouter,
  programDocumentTypesTemplatesRouter,
);
