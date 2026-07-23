/**
 * SessionCompliancePanel.tsx — Dashboard panel for session-managed program compliance.
 *
 * Surfaced in Dashboard.tsx ONLY when the programa filter has a specific
 * session-managed edition selected (program.inscribible === true, not "all").
 *
 * DESIGN NOTE: Two distinct absence detection mechanisms coexist in /dashboard:
 *   1. AbsenceAlertsPanel (directly above) — threshold-based: last N days
 *      without ANY attendance record across all programs.
 *   2. SessionCompliancePanel (this) — session-denominator-based: ≥2
 *      consecutive missed sessions for THIS edition specifically.
 *   Both are intentional and serve different operational purposes.
 *   TODO(future): reconcile into a unified absence surface once data models align.
 */
import { ClipboardList } from "lucide-react";
import { ComplianceDashboard } from "@/features/programs/components/sessions/ComplianceDashboard";

interface SessionCompliancePanelProps {
  programId: string;
  programName: string;
}

export function SessionCompliancePanel({ programId, programName }: SessionCompliancePanelProps) {
  return (
    <section aria-labelledby="session-compliance-heading">
      <div className="flex items-center gap-2 mb-3">
        <ClipboardList className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h2
          id="session-compliance-heading"
          className="text-eyebrow text-muted-foreground"
        >
          Cumplimiento de sesiones — {programName}
        </h2>
      </div>
      <ComplianceDashboard programId={programId} />
    </section>
  );
}
