import { trpc } from "@/lib/trpc";

// Reparto (delivery cycle) hooks. Procedures live under the families router.

export function useRepartos(program_id: string) {
  return trpc.families.listRounds.useQuery(
    { program_id },
    { enabled: !!program_id, staleTime: 15_000 },
  );
}

export function useListSlots(roundId: string) {
  return trpc.families.listSlots.useQuery(
    { round_id: roundId },
    { enabled: !!roundId, staleTime: 5_000 },
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
    onSuccess: () => utils.families.listRounds.invalidate(),
  });
}

/** Server-authoritative forecast of the suggested distribution (borrador only). */
export function usePreviewAssignments(round_id: string) {
  return trpc.families.previewAssignments.useQuery(
    { round_id },
    { enabled: !!round_id, staleTime: 30_000 },
  );
}

/** Commit the suggested distribution and activate the round. */
export function useActivateReparto() {
  const utils = trpc.useUtils();
  return trpc.families.activateRound.useMutation({
    onSuccess: () => utils.families.listRounds.invalidate(),
  });
}

export function useCloseReparto() {
  const utils = trpc.useUtils();
  return trpc.families.closeRound.useMutation({
    onSuccess: () => utils.families.listRounds.invalidate(),
  });
}

export function useCerrarTurno() {
  const utils = trpc.useUtils();
  return trpc.families.cerrarTurno.useMutation({
    onSuccess: () => {
      utils.families.listSlots.invalidate();
      utils.families.listRounds.invalidate();
      // Carry-over model: closing a turno does NOT mark anyone no-show; it just
      // locks the slot. Refresh the roster and absentismo so the UI reflects this.
      utils.families.getSlotRoster.invalidate();
      utils.families.getAbsentismoByRound.invalidate();
    },
  });
}

export function useDeleteReparto() {
  const utils = trpc.useUtils();
  return trpc.families.deleteRound.useMutation({
    onSuccess: () => utils.families.listRounds.invalidate(),
  });
}

// ─── Close-out ────────────────────────────────────────────────────────────────

/** Roster for one day's close-out: pending (all round) + attended in this slot. */
export function useSlotRoster(round_id: string, slot_id: string) {
  return trpc.families.getSlotRoster.useQuery(
    { round_id, slot_id },
    { enabled: !!round_id && !!slot_id, staleTime: 5_000 },
  );
}

export function useMarkAttendance() {
  const utils = trpc.useUtils();
  return trpc.families.markAttendance.useMutation({
    onSuccess: () => utils.families.getSlotRoster.invalidate(),
  });
}

export function useUndoAttendance() {
  const utils = trpc.useUtils();
  return trpc.families.undoAttendance.useMutation({
    onSuccess: () => utils.families.getSlotRoster.invalidate(),
  });
}

export function useRescheduleAssignment() {
  const utils = trpc.useUtils();
  return trpc.families.rescheduleAssignment.useMutation({
    onSuccess: () => {
      utils.families.getSlotRoster.invalidate();
      utils.families.getRoundActa.invalidate();
    },
  });
}

export function useSetContactoFamilia() {
  const utils = trpc.useUtils();
  return trpc.families.setContactoFamilia.useMutation({
    onSuccess: () => {
      utils.families.getSlotRoster.invalidate();
      utils.families.getRoundActa.invalidate();
    },
  });
}

// ─── Documents (admin) ──────────────────────────────────────────────────────

/** Complete round roster for both actas (citación antes / final después). */
export function useRoundActa(round_id: string, enabled = true) {
  return trpc.families.getRoundActa.useQuery(
    { round_id },
    { enabled: enabled && !!round_id, staleTime: 10_000 },
  );
}

export function useAttachSignedActa() {
  const utils = trpc.useUtils();
  return trpc.families.attachSignedActa.useMutation({
    onSuccess: () => {
      utils.families.listSlots.invalidate();
      utils.families.listRounds.invalidate();
    },
  });
}

export function useProposeActaCloseout() {
  return trpc.families.proposeActaCloseout.useMutation();
}

export function useBulkMarkAttendance() {
  const utils = trpc.useUtils();
  return trpc.families.bulkMarkAttendance.useMutation({
    onSuccess: () => utils.families.getSlotRoster.invalidate(),
  });
}

// ─── Firma digital (PR-4, RGPD-gated) ───────────────────────────────────────

/** Whether on-screen signing is enabled (server env — hides the flow when off). */
export function useFirmaEnabled() {
  return trpc.families.getFirmaEnabled.useQuery(undefined, { staleTime: 300_000 });
}

/** Atomic attend + signature capture. Invalidates the roster on success. */
export function useRecordRepartoSignature() {
  const utils = trpc.useUtils();
  return trpc.families.recordRepartoSignature.useMutation({
    onSuccess: () => utils.families.getSlotRoster.invalidate(),
  });
}
