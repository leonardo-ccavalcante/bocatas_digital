/**
 * templated/complianceSnapshot.ts — Compliance snapshot (CM-1..CM-6).
 *
 * REUSE: Delegates to `compliance.getComplianceStats` from
 * server/routers/families/compliance.ts. Do NOT duplicate the query logic.
 *
 * Output shape mirrors getComplianceStats: { cm1, cm2, cm3, cm4, cm5, cm5List, cm6 }
 *
 * Compliance: adminProcedure. wrapDbError is owned by the delegated procedure.
 *   RGPD Art. 30: logAuditReport called after delegation returns.
 */

import { router, adminProcedure } from "../../../_core/trpc";
import { complianceRouter } from "../../families/compliance";
import { logAuditReport } from "../_shared";

export const complianceSnapshotRouter = router({
  complianceSnapshot: adminProcedure.query(async ({ ctx }) => {
    // Delegate entirely to the existing getComplianceStats procedure.
    // createCaller passes through the ctx so the same adminProcedure guard
    // on getComplianceStats is enforced (defense in depth).
    const complianceCaller = complianceRouter.createCaller(ctx);
    const result = await complianceCaller.getComplianceStats();

    // aggregate snapshot — no row-level count
    logAuditReport(ctx, "reports.complianceSnapshot", 0);

    return result;
  }),
});
