/**
 * useAnnouncements.ts — React Query hooks for Announcements (Novedades)
 * Wave 3: expanded with audience, audit, dismissal, banner, and bulk-import hooks.
 */
import { trpc } from "@/lib/trpc";
import type { TipoAnnouncement } from "@shared/announcementTypes";

// ─── Read hooks (any authenticated user) ──────────────────────────────────────

/** List announcements visible to the current user. */
export function useAnnouncements(options?: {
  tipo?: TipoAnnouncement;
  soloUrgentes?: boolean;
  limit?: number;
  offset?: number;
  includeInactive?: boolean;
}) {
  return trpc.announcements.getAll.useQuery(
    {
      tipo: options?.tipo,
      soloUrgentes: options?.soloUrgentes ?? false,
      limit: options?.limit ?? 20,
      offset: options?.offset ?? 0,
      includeInactive: options?.includeInactive ?? false,
    },
    { staleTime: 30_000 }
  );
}

/** Get a single announcement by ID. */
export function useAnnouncement(id: string) {
  return trpc.announcements.getById.useQuery(
    { id },
    { enabled: !!id }
  );
}

/**
 * Get the most-recent active urgent announcement for the /inicio banner.
 * Returns null when there is nothing to show.
 */
export function useUrgentBannerAnnouncement() {
  return trpc.announcements.getUrgentBannerAnnouncement.useQuery(undefined, {
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

// ─── Read hooks (admin/superadmin only) ───────────────────────────────────────

/** Audience rules for an announcement — used in the admin edit form. */
export function useAnnouncementAudiences(announcement_id: string) {
  return trpc.announcements.getAudiencesByAnnouncementId.useQuery(
    { announcement_id },
    { enabled: !!announcement_id }
  );
}

/** Per-field audit log for an announcement. */
export function useAnnouncementAuditLog(
  announcement_id: string,
  limit = 50
) {
  return trpc.announcements.getAuditLog.useQuery(
    { announcement_id, limit },
    { enabled: !!announcement_id }
  );
}

/** Dismissal stats — who has/hasn't seen an urgent announcement. */
export function useDismissalStats(announcement_id: string) {
  return trpc.announcements.getDismissalStats.useQuery(
    { announcement_id },
    { enabled: !!announcement_id }
  );
}

// ─── Write hooks (admin/superadmin) ──────────────────────────────────────────

/** Create a new announcement with audience rules. */
export function useCreateAnnouncement() {
  const utils = trpc.useUtils();
  return trpc.announcements.create.useMutation({
    onSuccess: () => {
      void utils.announcements.getAll.invalidate();
      void utils.announcements.getUrgentBannerAnnouncement.invalidate();
    },
  });
}

/** Update an announcement (diff + audit log + optional audience replace). */
export function useUpdateAnnouncement() {
  const utils = trpc.useUtils();
  return trpc.announcements.update.useMutation({
    onSuccess: (_data, variables) => {
      void utils.announcements.getAll.invalidate();
      void utils.announcements.getById.invalidate({ id: variables.id });
      void utils.announcements.getAudiencesByAnnouncementId.invalidate({
        announcement_id: variables.id,
      });
      void utils.announcements.getAuditLog.invalidate({
        announcement_id: variables.id,
      });
      void utils.announcements.getUrgentBannerAnnouncement.invalidate();
    },
  });
}

/** Soft-delete an announcement (sets activo=false). */
export function useDeleteAnnouncement() {
  const utils = trpc.useUtils();
  return trpc.announcements.delete.useMutation({
    onSuccess: () => {
      void utils.announcements.getAll.invalidate();
      void utils.announcements.getUrgentBannerAnnouncement.invalidate();
    },
  });
}

/** Flip the pinned status of an announcement. */
export function useTogglePinAnnouncement() {
  const utils = trpc.useUtils();
  return trpc.announcements.togglePin.useMutation({
    onSuccess: (_data, variables) => {
      void utils.announcements.getAll.invalidate();
      void utils.announcements.getById.invalidate({ id: variables.id });
    },
  });
}

/** Parse a CSV blob and store a preview token (30-min TTL). */
export function usePreviewBulkImport() {
  return trpc.announcements.previewBulkImport.useMutation();
}

/** Confirm a bulk import by preview token — inserts all valid rows. */
export function useConfirmBulkImport() {
  const utils = trpc.useUtils();
  return trpc.announcements.confirmBulkImport.useMutation({
    onSuccess: () => {
      void utils.announcements.getAll.invalidate();
      void utils.announcements.getUrgentBannerAnnouncement.invalidate();
    },
  });
}

// ─── Write hooks (any authenticated user) ────────────────────────────────────

/**
 * Dismiss an urgent announcement for the current user (/inicio banner).
 *
 * Currently a no-op: the server-side `announcements.dismissUrgent`
 * procedure was removed because it wrote `String(ctx.user.id)` (a
 * stringified MySQL int) into `announcement_dismissals.person_id`,
 * which the RLS policy expects to be `auth.uid()` (a UUID). The banner
 * still hides for the rest of the session via component state — only
 * the cross-session persistence is gone. Re-enable after Supabase JWT
 * auth lands and beneficiarios are provisioned with
 * `auth.users.id = persons.id`.
 *
 * Returns the same `{ mutate }` shape as a real mutation so callers
 * (`UrgentAnnouncementBanner.tsx`) do not need changes.
 */
export function useDismissUrgentAnnouncement(): {
  mutate: (input: { announcement_id: string }) => void;
} {
  return {
    mutate: () => {
      /* no-op until JWT auth lands */
    },
  };
}
