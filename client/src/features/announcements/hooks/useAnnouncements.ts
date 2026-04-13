/**
 * useAnnouncements.ts — React Query hooks for Announcements (Novedades)
 * Task 7 — Phase F
 */
import { trpc } from "@/lib/trpc";

/** List active announcements for the current user's role */
export function useAnnouncements(options?: {
  tipo?: "info" | "urgente" | "evento" | "cierre";
  limit?: number;
  offset?: number;
  includeInactive?: boolean;
}) {
  return trpc.announcements.getAll.useQuery(
    {
      tipo: options?.tipo,
      limit: options?.limit ?? 20,
      offset: options?.offset ?? 0,
      includeInactive: options?.includeInactive ?? false,
    },
    { staleTime: 30_000 }
  );
}

/** Get a single announcement by ID */
export function useAnnouncement(id: string) {
  return trpc.announcements.getById.useQuery(
    { id },
    { enabled: !!id }
  );
}

/** Create a new announcement (admin+) */
export function useCreateAnnouncement() {
  const utils = trpc.useUtils();
  return trpc.announcements.create.useMutation({
    onSuccess: () => utils.announcements.getAll.invalidate(),
  });
}

/** Update an announcement (admin+) */
export function useUpdateAnnouncement() {
  const utils = trpc.useUtils();
  return trpc.announcements.update.useMutation({
    onSuccess: () => utils.announcements.getAll.invalidate(),
  });
}

/** Soft-delete an announcement (admin+) */
export function useDeleteAnnouncement() {
  const utils = trpc.useUtils();
  return trpc.announcements.delete.useMutation({
    onSuccess: () => utils.announcements.getAll.invalidate(),
  });
}

/** Toggle pinned status (admin+) */
export function useTogglePinAnnouncement() {
  const utils = trpc.useUtils();
  return trpc.announcements.togglePin.useMutation({
    onSuccess: () => utils.announcements.getAll.invalidate(),
  });
}
