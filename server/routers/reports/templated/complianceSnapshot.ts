/**
 * templated/complianceSnapshot.ts — Compliance snapshot (CM-1..CM-6).
 *
 * REUSE: Delegates to `compliance.getComplianceStats` from
 * server/routers/families/compliance.ts. Do NOT duplicate the query logic.
 *
 * Output shape mirrors getComplianceStats: { cm1, cm2, cm3, cm4, cm5, cm5List, cm6 }
 *
 * Compliance: adminProcedure. wrapDbError is owned by the delegated procedure.
 */

import { router, adminProcedure } from "../../../_core/trpc";
import { complianceRouter } from "../../families/compliance";

export const complianceSnapshotRouter = router({
  complianceSnapshot: adminProcedure.query(async ({ ctx }) => {
    // Delegate entirely to the existing getComplianceStats procedure.
    // createCaller passes through the ctx so the same adminProcedure guard
    // on getComplianceStats is enforced (defense in depth).
    const complianceCaller = complianceRouter.createCaller(ctx);
    return complianceCaller.getComplianceStats();
  }),
});
