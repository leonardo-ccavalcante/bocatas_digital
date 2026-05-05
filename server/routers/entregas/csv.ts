import { publicProcedure, router } from "../../_core/trpc";
import { generateEntregasCSVTemplate } from "../../csvTemplateGenerator";

export const csvRouter = router({
  /**
   * Download CSV template with sample data and guide.
   */
  downloadTemplate: publicProcedure.query(async () => {
    const { csvContent, guideContent, fileName } = generateEntregasCSVTemplate();
    return { csvContent, guideContent, fileName };
  }),
});
