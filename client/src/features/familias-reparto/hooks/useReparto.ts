import { trpc } from "@/lib/trpc";

// Reparto (delivery cycle) hooks. Procedures live under the families router.

export function useRepartos(program_id: string) {
  return trpc.families.listRounds.useQuery(
    { program_id },
    { enabled: !!program_id, staleTime: 15_000 },
  );
}

export function useEligibleFamilies(program_id: string) {
  return trpc.families.getEligibleFamilies.useQuery(
    { program_id },
    { enabled: !!program_id, staleTime: 60_000 },
  );
}

export function useCreateReparto() {
  const utils = trpc.useUtils();
  return trpc.families.createRound.useMutation({
    onSuccess: (data) => {
      if (data?.program_id) utils.families.listRounds.invalidate({ program_id: data.program_id });
    },
  });
}

export function useCommitAssignments() {
  const utils = trpc.useUtils();
  return trpc.families.commitAssignments.useMutation({
    onSuccess: () => utils.families.listRounds.invalidate(),
  });
}

export function useCloseReparto() {
  const utils = trpc.useUtils();
  return trpc.families.closeRound.useMutation({
    onSuccess: () => utils.families.listRounds.invalidate(),
  });
}

export function useDeleteReparto() {
  const utils = trpc.useUtils();
  return trpc.families.deleteRound.useMutation({
    onSuccess: () => utils.families.listRounds.invalidate(),
  });
}

// ─── Close-out ────────────────────────────────────────────────────────────────
export function useAssignmentsForDay(round_id: string, assigned_day: string) {
  return trpc.families.getAssignmentsForDay.useQuery(
    { round_id, assigned_day },
    { enabled: !!round_id && !!assigned_day, staleTime: 5_000 },
  );
}

export function useMarkAttendance() {
  const utils = trpc.useUtils();
  return trpc.families.markAttendance.useMutation({
    onSuccess: () => utils.families.getAssignmentsForDay.invalidate(),
  });
}

export function useUndoAttendance() {
  const utils = trpc.useUtils();
  return trpc.families.undoAttendance.useMutation({
    onSuccess: () => utils.families.getAssignmentsForDay.invalidate(),
  });
}

export function useRescheduleAssignment() {
  const utils = trpc.useUtils();
  return trpc.families.rescheduleAssignment.useMutation({
    onSuccess: () => utils.families.getAssignmentsForDay.invalidate(),
  });
}

export function useReassignPending() {
  const utils = trpc.useUtils();
  return trpc.families.reassignPending.useMutation({
    onSuccess: () => utils.families.getAssignmentsForDay.invalidate(),
  });
}

// ─── Documents (admin) ──────────────────────────────────────────────────────
export function useSigningRoster(round_id: string, assigned_day: string, enabled = true) {
  return trpc.families.getSigningRoster.useQuery(
    { round_id, assigned_day },
    { enabled: enabled && !!round_id && !!assigned_day, staleTime: 10_000 },
  );
}

export function useListadoInterno(round_id: string, assigned_day: string, enabled = true) {
  return trpc.families.getListadoInterno.useQuery(
    { round_id, assigned_day },
    { enabled: enabled && !!round_id && !!assigned_day, staleTime: 10_000 },
  );
}

export function useAttachSignedActa() {
  const utils = trpc.useUtils();
  return trpc.families.attachSignedActa.useMutation({
    onSuccess: () => utils.families.listRounds.invalidate(),
  });
}

export function useProposeActaCloseout() {
  return trpc.families.proposeActaCloseout.useMutation();
}

export function useBulkMarkAttendance() {
  const utils = trpc.useUtils();
  return trpc.families.bulkMarkAttendance.useMutation({
    onSuccess: () => utils.families.getAssignmentsForDay.invalidate(),
  });
}
