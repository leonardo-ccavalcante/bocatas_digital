/**
 * ComplianceSnapshotModal.tsx — Wraps the existing ComplianceDashboard.
 *
 * REUSE: Renders <ComplianceDashboard /> from features/families/components/.
 * Does NOT duplicate the layout or the query — those live in ComplianceDashboard.
 * The modal just provides the Dialog shell + the tRPC query (enabled: open).
 *
 * Query: trpc.reports.complianceSnapshot (delegates to families/compliance server-side).
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ComplianceDashboard } from "@/features/families/components/ComplianceDashboard";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ComplianceSnapshotModal({ open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-3xl max-h-[80vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>Compliance — estado actual</DialogTitle>
        </DialogHeader>
        {/*
          ComplianceDashboard fetches its own data via the families hooks.
          When the modal mounts (open=true) the hooks fire automatically.
          When the modal unmounts the queries are garbage-collected per TanStack Query defaults.
        */}
        {open && <ComplianceDashboard />}
      </DialogContent>
    </Dialog>
  );
}
